import glob, re

etiquetas = '''<link rel="icon" href="favicon.ico"/>
<link rel="apple-touch-icon" href="assets/img/icon-180.png"/>
<link rel="manifest" href="manifest.json"/>
<meta name="theme-color" content="#d02b2f"/>
'''

modificados = []
saltados = []

for archivo in sorted(glob.glob('*.html')):
    with open(archivo, 'r', encoding='utf-8') as f:
        contenido = f.read()

    if 'rel="icon"' in contenido or 'apple-touch-icon' in contenido:
        saltados.append(archivo)
        continue

    patron = re.search(r'<meta[^>]*name="viewport"[^>]*/?>\s*\n', contenido)
    if not patron:
        saltados.append(archivo + ' (no encontró viewport)')
        continue

    pos = patron.end()
    nuevo_contenido = contenido[:pos] + etiquetas + contenido[pos:]

    with open(archivo, 'w', encoding='utf-8') as f:
        f.write(nuevo_contenido)
    modificados.append(archivo)

print(f"Modificados: {len(modificados)}")
for m in modificados:
    print(" -", m)
if saltados:
    print("Saltados (ya tenían los tags, o no encontró viewport):", saltados)
