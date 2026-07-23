import { a0 as t } from './index-C531BqZY.js';
const m = {
  recommendWork: e => t.post(`/posecraft/v1/works/${e}/recommend`),
  cancelRecommendWork: e => t.delete(`/posecraft/v1/works/${e}/recommend`),
  recommendTemplate: e => t.post(`/posecraft/v1/templates/${e}/recommend`),
  cancelRecommendTemplate: e => t.delete(`/posecraft/v1/templates/${e}/recommend`),
  getMyList: e => t.get('/posecraft/v1/recommendations/mine', { params: e }),
  getMyCount: () => t.get('/posecraft/v1/recommendations/mine/count'),
  checkStatus: e => t.get('/posecraft/v1/recommendations/status', { params: e })
};
export { m as recommendationApi };
