import urllib.request
try:
    response = urllib.request.urlopen('http://localhost:5173')
    print("Response code:", response.getcode())
    print("HTML chunk:", response.read(200).decode('utf-8'))
except Exception as e:
    print("Error:", e)
