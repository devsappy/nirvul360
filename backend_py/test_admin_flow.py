import urllib.request, json, http.cookiejar

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Login as Super Admin
data = json.dumps({'email': 'superadmin@gross.bd', 'password': 'password123'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/login', data=data, headers={'Content-Type': 'application/json'})
res = opener.open(req)
print('Login:', res.read().decode())

# 2. Get /api/admin/tenants
req2 = urllib.request.Request('http://127.0.0.1:8000/api/admin/tenants')
res2 = opener.open(req2)
tenants_data = json.loads(res2.read().decode())
print(f"Tenants count: {len(tenants_data['tenants'])}")
for t in tenants_data['tenants']:
    print(f"  - [{t['id']}] {t['name']} | Owner: {t['owner']['name']} ({t['owner']['email']}) | Orders: {t['metrics']['total_orders']}")

# 3. Get /api/admin/activity
req3 = urllib.request.Request('http://127.0.0.1:8000/api/admin/activity')
res3 = opener.open(req3)
act_data = json.loads(res3.read().decode())
print(f"Activity logs: {len(act_data['activity'])}")

# 4. Switch context to Tenant 2 (Dhaka Gadget Hub)
req4 = urllib.request.Request('http://127.0.0.1:8000/api/admin/switch-tenant', data=json.dumps({'merchant_id': 2}).encode('utf-8'), headers={'Content-Type': 'application/json'})
res4 = opener.open(req4)
print('Switch to Tenant 2:', res4.read().decode())

# 5. Check /api/me and /api/orders after switch
req5 = urllib.request.Request('http://127.0.0.1:8000/api/me')
print('Me after switch:', opener.open(req5).read().decode())

req6 = urllib.request.Request('http://127.0.0.1:8000/api/orders')
raw_orders = opener.open(req6).read().decode()
print("Raw orders response:", raw_orders[:300])
