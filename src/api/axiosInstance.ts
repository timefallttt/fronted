import axios from 'axios';

// 创建axios实例
const axiosInstance = axios.create({
  baseURL: 'http://localhost:8000/api/v1', // 后端API基础URL
  timeout: 30000, // 请求超时时间
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    // 只返回响应数据
    return response;
  },
  (error) => {
    // 统一处理错误
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

export default axiosInstance;