const { Movie, MovieTorrent } = require('./Entities/Movie');
const ptt = require('parse-torrent-title');
const fs = require('fs-extra');
const path = require('path');
const TMDB = require('./Services/tmdb');
const emitter = global.emitter;

module.exports = class Movies {
  constructor() {
    this.construct(__dirname);
    this.tmdb = null;
  }

  setup() {
    this.logDebug('Setting up movies plugin');
    this.settings.movies = this.settings.movies.map((s) => this.getMovie(s));

    if (this.settings.tmdbAPIKey.length) {
      this._initTMDB();
    }
  }

  subscriptions() {
    this.subscribe('torrentrss.feed-items', this.actOnFeedItems);
    this.subscribe('qbittorrent.download-complete', this.actOnDownloadComplete);
  }

  routes() {
    this.route('get', '', this.getMovies);
    this.route('post', '', this.postMovie);
    this.route('post', 'remove', this.deleteMovie);
    this.route('post', 'download', this.postDownload);
    this.route('post', 'settings', this.postSettings);
    this.route('get', 'upcoming', this.getUpcomingMovies);
    this.route('get', 'popular', this.getPopularMovies);
  }

  /********* Route Functions *********/

  getMovies = (req, res) => {
    return res.status(200).send({
      ...this.settings,
      validResolutions: ['2160p', '1080p', '720p']
    });
  };

  postMovie = (req, res) => {
    const movie = req.body.movie;
    if (!movie) {
      return res.status(400).send();
    }
    if (this.settings.movies.findIndex(x => x.name === movie) > -1) {
      return res.status(409).send();
    }
    this._addMovie(movie);
    return res.status(200).send(this.getSettings());
  };

  deleteMovie = (req, res) => {
    const movie = req.body.movie;
    if (!movie) {
      return res.status(400).send();
    }
    if (this.settings.movies.findIndex(x => x.name === movie) === -1) {
      return res.status(409).send();
    }
    this._removeMovie(movie);
    return res.status(200).send(this.getSettings());
  };

  postDownload = (req, res) => {
    /** @type {MovieTorrent} */
    const torrent = req.body;
    if (!torrent) {
      return res.status(400).send();
    }

    const fullPath = path.resolve(torrent.savePath, torrent.fileName);

    emitter.emit('file.download', torrent.uri, fullPath, () => {
      this._setTorrentAsDownloaded(torrent);
      return res.status(200).send(this.getSettings());
    });
  };

  postSettings = (req, res) => {
    const settings = req.body;
    if (!settings) {
      return res.status(400).send();
    }
    Object.keys(settings).forEach(x => {
      this.settings[x] = settings[x];

      if (x === 'tmdbAPIKey' && !this.tmdb) {
        this._initTMDB();
      }
    });
    this.saveSettings(this.settings);
    return res.status(200).send(this.getSettings());
  };

  getUpcomingMovies = async (req, res) => {
    if (!this.tmdb) {
      return res.status(400).send();
    }
    const data = await this.tmdb.getUpcoming();
    return res.status(200).send(data.results);
  }

  getPopularMovies = async (req, res) => {
    if (!this.tmdb) {
      return res.status(400).send();
    }
    const data = await this.tmdb.getPopular();
    return res.status(200).send(data.results);
  }


  /********* Event Functions *********/
  actOnFeedItems = ({ feedDomain, feedUrl, feedItems }) => {
    /** @type {Movie[]} */
    const moviesToDownload = this.settings.movies;

    let items = feedItems.filter(x =>
      x.resolution &&
      !x.episode &&
      !x.season
    );

    // Filter low resolutions
    const resolutionTarget = this._resolutionScore(this.settings.minResolution);
    items = items.filter(x => this._resolutionScore(x.resolution) >= resolutionTarget);

    // Filter movies not in list
    items = items.filter((entry) =>
      moviesToDownload.map((s) => s.name.toLowerCase()).includes(entry.title)
    );

    moviesToDownload.forEach(movie => {
      const newTorrents = items
        .filter(x => x.title === movie.name.toLowerCase())
        .filter(x => !movie.torrents.find(y => x.link === y.uri))

      movie.torrents.push(...newTorrents.map(x =>
        new MovieTorrent({
          title: x.release,
          fileName: x.fileName,
          uri: x.link,
          torrentDomain: feedDomain,
          savePath: this.settings.savePath
        })
      ));
    });

    this.settings.movies = moviesToDownload;
    this.saveSettings(this.settings);
  };

  actOnDownloadComplete = async (torrent) => {
    const movieInfo = ptt.parse(torrent.name);
    if (!movieInfo) {
      this.logDiag('Could not parse torrent info, aborting.');
      return;
    }

    const movie = this.settings.movies.find(
      (s) => this.cleanName(s.name) === this.cleanName(movieInfo.title)
    );

    if (!movie) {
      this.logDiag('Downloaded torrent is not a movie, aborting.');
      return;
    }

    if (movie.copyTo.length) {
      const orgPath = path.join(torrent.save_path, torrent.name);
      const newPath = path.join(movie.copyTo, torrent.name);

      try {
        this.logInfo(`Copying from ${torrent.save_path} to ${movie.copyTo}`);
        await fs.ensureDir(movie.copyTo);
        await fs.copyFile(orgPath, newPath);
        this.logInfo(`Finished copying ${orgPath} to ${newPath}`);
      } catch (e) {
        this.logError(
          `Error occurred while trying to copy ${orgPath} to ${newPath}`
        );
      }
    }
  };


  /********* Plugin Functions *********/

  _addMovie = (movie, source) => {
    let newMovies = 0;
    if (!Array.isArray(movie)) {
      movie = [movie];
    }
    movie = movie.map((s) => this.cleanName(s));
    movie = movie.map((s) => this.getMovie({ name: s }));
    movie = movie.filter((s) => !this.settings.movies.findIndex(x => x.name === s.name) > -1);

    if (movie.length === 0) {
      return;
    }

    this.settings.movies = [...this.settings.movies, ...movie];
    newMovies = movie.map((s) => s.Name).join(', ');

    if (newMovies) {
      if (source) {
        this.logInfo(`Added ${newMovies} to list from ${source}.`, { color: 'green' });
      } else {
        this.logInfo(`Added ${newMovies} to list.`, { color: 'green' });
      }
    }
    this.saveSettings(this.settings);
  }


  _removeMovie = (movie) => {
    let removedMovies = 0;
    if (!Array.isArray(movie)) {
      movie = [movie];
    }
    movie = movie.map((s) => this.getMovie({ name: s }));
    movie = movie.filter((s) => this.settings.movies.findIndex(x => x.name === s) === -1);

    if (movie.length === 0) {
      return;
    }

    movie.forEach(x => {
      const idx = this.settings.movies.findIndex(y => y.name === x.name);
      this.settings.movies.splice(idx, 1);
    })

    removedMovies = movie.map((s) => s.Name).join(', ');

    if (removedMovies) {
      this.logInfo(`Removed ${removedMovies} from list.`, { color: 'red' });
    }
    this.saveSettings(this.settings);
  }

  /** @param {MovieTorrent} torrent */
  _setTorrentAsDownloaded(torrent) {
    torrent.downloaded = true;
    const movieidx = this.settings.movies.findIndex(x => x.torrents.find(y => y.title === torrent.title));
    const torrentidx = this.settings.movies[movieidx].torrents.findIndex(x => x.title === torrent.title);
    this.settings.movies[movieidx].torrents[torrentidx].downloaded = true;
    this.saveSettings(this.settings);
  }

  /** @param {'2160p'|'1080p'|'720p'} resolution  */
  _resolutionScore(resolution) {
    switch (resolution) {
      case '2160p':
        return 10000;
      case '1080p':
        return 1000;
      case '720p':
        return 100;
      default:
        return 10;
    }
  }

  _initTMDB() {
    this.tmdb = new TMDB(this.settings.tmdbAPIKey)
  }

  getSettings() {
    return {
      ...this.settings,
      validResolutions: ['2160p', '1080p', '720p']
    };
  }

  getMovie = movie => {
    return new Movie(movie);
  }

  cleanName(name) {
    return name.toLowerCase();
  }
};
