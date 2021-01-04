const axios = require('axios').default;

module.exports = class TMDB {
  constructor(apikey) {
    this.apikey = apikey;
    this.tmp = [];
  }

  async getUpcoming(page = 1) {
    const url = `https://api.themoviedb.org/3/movie/upcoming?api_key=${this.apikey}&language=en-US&page=${page}&region=US`;
    const response = await axios.get(url);

    if (response.data.total_pages > page) {
      this.tmp = response.data.results;
      return this.getUpcoming(page + 1);
    }

    if (this.tmp.length) {
      response.data.results = [...response.data.results, ...this.tmp]
      this.tmp = [];
    }

    return response.data;
  }

  async getPopular(page = 1) {
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${this.apikey}&language=en-US&page=${page}&region=US`;
    const response = await axios.get(url);
    return response.data;
  }
}
