import urllib.request, json, http.cookiejar

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# 1. Login as Agency Owner Tamim Ahmed
data = json.dumps({'email': 'owner@demo.bd', 'password': 'password123'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/login', data=data, headers={'Content-Type': 'application/json'})
res = opener.open(req)
print("1. Login:", res.read().decode())

# 2. Fetch /api/products
req2 = urllib.request.Request('http://127.0.0.1:8000/api/products')
res2 = opener.open(req2)
prods = json.loads(res2.read().decode())
print(f"2. Products count: {len(prods)}")
for p in prods[:3]:
    print(f"   [{p['id']}] {p['name']} | SKU: {p['sku']} | Active: {p['active']} | Selling: BDT {p['selling_price']/100} | Cost: BDT {(p['cost_price'] or 0)/100} | Stock: {p['stock_qty']}")

# 3. Toggle product status (active -> false)
p1_id = prods[0]['id']
req3 = urllib.request.Request(
    f'http://127.0.0.1:8000/api/products/{p1_id}/status',
    data=json.dumps({'active': False}).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='PATCH'
)
res3 = opener.open(req3)
print(f"3. Toggle Product #{p1_id} status:", res3.read().decode())

# 4. Update product selling price & cost price
req4 = urllib.request.Request(
    f'http://127.0.0.1:8000/api/products/{p1_id}/price',
    data=json.dumps({'selling_price': 1750, 'cost_price': 800}).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='PATCH'
)
res4 = opener.open(req4)
print(f"4. Update Product #{p1_id} price:", res4.read().decode())

# 5. Connect WordPress / WooCommerce Store Website
req5 = urllib.request.Request(
    'http://127.0.0.1:8000/api/integrations/store',
    data=json.dumps({
        'platform': 'wordpress',
        'store_url': 'https://demo-woocommerce.local',
        'api_key': 'ck_demo123456',
        'api_secret': 'cs_demo654321',
        'auto_sync': True
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
res5 = opener.open(req5)
print("5. Connect Store:", res5.read().decode())

# 6. Pull Inventory Data from Store Website!
req6 = urllib.request.Request(
    'http://127.0.0.1:8000/api/integrations/store/pull-inventory',
    data=json.dumps({'platform': 'wordpress'}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
res6 = opener.open(req6)
print("6. Pull Inventory:", res6.read().decode())

# 7. Check products after pulling
res7 = opener.open(req2)
prods_after = json.loads(res7.read().decode())
print(f"7. Products count after pulling from WordPress: {len(prods_after)}")
for p in prods_after[:4]:
    print(f"   [{p['id']}] {p['name']} | SKU: {p['sku']} | Active: {p['active']} | Selling: BDT {p['selling_price']/100} | Cost: BDT {(p['cost_price'] or 0)/100} | Source: {p['source']}")
