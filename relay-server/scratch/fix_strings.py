with open(r'D:\ai\HomeAutomation v2\relay-server\internal\httpapi\router.go', 'r', encoding='utf-8') as f:
    text = f.read()

bad1 = '''\t\tmockContent := "{\n  \\"version\\": \\"1.6.0\\",\n  \\"hostname\\": \\"smarthome-node\\",\n  \\"auth_enabled\\": false\n}"
\t\tif strings.Contains(filePath, "wifi") {
\t\t\tmockContent = "{\n  \\"ssid\\": \\"SmartHome_IoT\\",\n  \\"dhcp\\": true\n}"
\t\t} else if strings.Contains(filePath, "ir_codes") {
\t\t\tmockContent = "{\n  \\"Living Room TV Power\\": \\"0x20DF10EF\\",\n  \\"AC Cool\\": \\"0x8800909\\"\n}"
\t\t}'''

good1 = '''\t\tmockContent := `{"version": "1.6.0", "hostname": "smarthome-node", "auth_enabled": false}`
\t\tif strings.Contains(filePath, "wifi") {
\t\t\tmockContent = `{"ssid": "SmartHome_IoT", "dhcp": true}`
\t\t} else if strings.Contains(filePath, "ir_codes") {
\t\t\tmockContent = `{"Living Room TV Power": "0x20DF10EF", "AC Cool": "0x8800909"}`
\t\t}'''

bad2 = '''\t\t_, _ = w.Write([]byte("{\\n  \\\"version\\\": \\\"1.6.0\\\",\\n  \\\"saved\\\": true\\n}"))'''
good2 = '''\t\t_, _ = w.Write([]byte(`{"version": "1.6.0", "saved": true}`))'''

bad3 = '''\t\t_, _ = w.Write([]byte("{\n  \\"version\\": \\"1.6.0\\",\n  \\"saved\\": true\n}"))'''

if bad1 in text:
    text = text.replace(bad1, good1)
    print("Fixed bad1")
else:
    # try regex replacement
    import re
    text = re.sub(r'mockContent := "{\s*\\"version\\":[\s\S]*?"\s*}"', good1, text)
    print("Regex replaced mockContent")

if bad2 in text:
    text = text.replace(bad2, good2)
    print("Fixed bad2")
elif bad3 in text:
    text = text.replace(bad3, good2)
    print("Fixed bad3")
else:
    import re
    text = re.sub(r'_\s*,\s*_\s*=\s*w\.Write\(\[\]byte\("\{[\s\S]*?"\)\)', good2, text)
    print("Regex replaced w.Write")

with open(r'D:\ai\HomeAutomation v2\relay-server\internal\httpapi\router.go', 'w', encoding='utf-8') as f:
    f.write(text)

print("router.go string literals repaired.")
