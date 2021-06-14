/* eslint-disable no-await-in-loop, no-console */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import http from 'http';
import https from 'https';
import config from 'src/config';

const instance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    authorization: `Bot ${config.token}`,
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

export default {
  get: async <T>(url: string, conf?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    for (;;) {
      try {
        return await instance.get<T>(url, conf);
      } catch (err) {
        console.error(err);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
  post: async <T>(
    url: string,
    data: unknown,
    conf?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> => {
    for (;;) {
      try {
        return await instance.post<T>(url, data, conf);
      } catch (err) {
        console.error(err);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
};
