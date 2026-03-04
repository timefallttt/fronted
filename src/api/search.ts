import axiosInstance from './axiosInstance';

// 搜索请求参数接口
export interface SearchRequest {
  query: string;
  top_k: number;
  threshold: number;
}

// 搜索结果接口
export interface SearchResult {
  snippet_id: string;
  code: string;
  filename: string;
  start_line: number;
  end_line: number;
  similarity: number;
  commit_message: string;
}

// 搜索响应接口
export interface SearchResponse {
  latency_ms: number;
  total_found: number;
  results: SearchResult[];
}

/**
 * 发送搜索请求
 * @param params 搜索参数
 * @returns 搜索结果
 */
export const searchCode = (params: SearchRequest) => {
   return axiosInstance.post<SearchResponse>('/retrieve', params).then(res =>{
      return res;
    })
};