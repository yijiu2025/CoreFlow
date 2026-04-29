import requests
import threading
import time
import uuid
import random
import concurrent.futures

# 配置基础 URL
BASE_URL = "http://localhost:3000"

# 预定义的测试路径池（包含合法路径和非法探测路径）
PATH_POOL = [
    "/api/firewall/v1/monitor/summary",
    "/api/firewall/v1/monitor/records",
    "/api/firewall/v1/apiconfigs/",
    "/api/auth/v1/token",
    "/api/book/v1/list",
    "/api/v1/unknown-endpoint",
    "/admin/config.php",
    "/.env",
    "/wp-login.php"
]

TOTAL_REQUESTS = 1000
CONCURRENT_THREADS = 50 

def send_request(req_id):
    try:
        # 1. 随机选择一个路径
        path = random.choice(PATH_POOL)
        target_url = f"{BASE_URL}{path}"
        
        # 2. 随机生成设备 ID (模拟不同访客)
        device_id = f"STRESS-DEV-{uuid.uuid4().hex[:6]}"
        
        headers = {
            'X-Device-Id': device_id,
            'User-Agent': f'Antigravity-Stress-Tester/2.0 (Device {req_id})'
        }
        
        start_time = time.time()
        response = requests.get(target_url, headers=headers, timeout=5)
        duration = time.time() - start_time
        
        return {
            'id': req_id,
            'url': path,
            'status': response.status_code,
            'time': duration,
            'msg': response.json().get('message', 'N/A') if response.status_code != 404 else 'Not Found'
        }
    except Exception as e:
        return {'id': req_id, 'status': None, 'error': str(e)}

def main():
    print(f"🌈 启动全路径压力测试: {BASE_URL}")
    print(f"📊 路径池大小: {len(PATH_POOL)} | 模拟并发: {CONCURRENT_THREADS}")
    print("-" * 60)

    results = []
    start_all = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_THREADS) as executor:
        futures = [executor.submit(send_request, i + 1) for i in range(TOTAL_REQUESTS)]
        
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            results.append(res)
            
            # 每 100 次打印一次详细摘要
            if len(results) % 100 == 0:
                last = res
                print(f"进度: {len(results)}/{TOTAL_REQUESTS} | 最新: {last['url']} -> {last['status']}")

    total_duration = time.time() - start_all
    
    # 统计
    statuses = [r['status'] for r in results]
    success_200 = statuses.count(200)
    blocked_429 = statuses.count(429)
    trapped_403 = statuses.count(403)
    not_found_404 = statuses.count(404)
    errors = statuses.count(None)

    print("-" * 60)
    print(f"🏁 压测结束! 性能汇总:")
    print(f"⏱️  总耗时: {total_duration:.2f}s")
    print(f"🚀 吞吐率: {TOTAL_REQUESTS / total_duration:.2f} req/s")
    print(f"✅ 成功 (200): {success_200}")
    print(f"🛡️  限流 (429): {blocked_429}")
    print(f"🪤  陷阱 (403): {trapped_403}")
    print(f"🔍 未找到 (404): {not_found_404}")
    print(f"❌ 异常: {errors}")
    print("-" * 60)
    print("💡 提示：由于 Device-ID 是随机生成的，理论上 429 拦截数应该很低。")
    print("💡 如果 429 很高，说明服务器正在通过 IP 进行全局限流。")

if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
