class Movie {
  constructor({ name, torrents = [], tracker = '*', copyTo = '' }) {
    /**
     * @type {String}
     * @description Name of the show (e.g. 'Free TV Show')
     */
    this.name = name;

    /**
     * @type {Array<MovieTorrent>}
     * @description List of torrents related to the movie
     */
    this.torrents = torrents;

    /**
     * @type {String}
     * @description Destination path (e.g. 'D:\movies\Rambo\')
     */
    this.copyTo = copyTo;

    /**
     * @type {String}
     * @description Domain of tracker without tld (e.g. 'google' for 'google.com')
     */
    this.tracker = tracker;
  }
};

class MovieTorrent {
  constructor({ title, fileName = '', uri = '', torrentDomain = '', savePath = '', downloaded = false }) {
    /**
     * @type {String}
     * @description Title of the torrent
     */
    this.title = title;

    /**
     * @type {String}
     * @description Torrent filename
     */
    this.fileName = fileName;

    /**
     * @type {String}
     * @description Link to the torrent
     */
    this.uri = uri;

    /**
     * @type {String}
     * @description Torrent domain
     */
    this.torrentDomain = torrentDomain;

    /**
     * @type {String}
     * @description Save path of torrent
     */
    this.savePath = savePath;

    /**
     * @type {Boolean}
     * @description Has it been downloaded
     */
    this.downloaded = downloaded;
  }
}

exports.Movie = Movie;
exports.MovieTorrent = MovieTorrent;
