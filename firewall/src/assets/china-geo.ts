// src/assets/china-geo.js
// 这是一个简化版的中国地图 GeoJSON 数据，用于 ECharts 展示
export const chinaGeo = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "中国" },
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [
          [[[110, 20], [120, 20], [120, 30], [110, 30], [110, 20]]] // 这是一个极其简化的占位符
        ]
      }
    }
  ]
};
// 注意：由于正式的 China GeoJSON 很大，建议在生产环境通过 URL 异步加载。
// 这里为了演示演示流程。
