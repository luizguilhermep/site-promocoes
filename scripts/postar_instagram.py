#!/usr/bin/env python3
import os
import sys
import json
from datetime import datetime
from pathlib import Path

try:
    from instagrapi import Client
    from PIL import Image, ImageDraw, ImageFont
    import requests
except ImportError as e:
    print(f"Erro ao importar: {e}")
    sys.exit(1)

# Config
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
INSTA_USERNAME = os.getenv('INSTA_USERNAME', 'eita__bexiga')
INSTA_PASSWORD = os.getenv('INSTA_PASSWORD')

def buscar_melhor_oferta():
    """Busca a oferta com maior desconto no Supabase"""
    import requests

    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }

    # Buscar ofertas ativas, ordenadas por criação
    url = f"{SUPABASE_URL}/rest/v1/promocoes?ativo=eq.true&order=criado_em.desc&limit=50"
    resp = requests.get(url, headers=headers)

    if resp.status_code != 200:
        print(f"Erro ao buscar ofertas: {resp.status_code}")
        return None

    ofertas = resp.json()

    # Filtrar por desconto e pegar a maior
    com_desconto = []
    for o in ofertas:
        try:
            desc_pct = int(o.get('desconto', '0').rstrip('% OFF'))
            com_desconto.append((desc_pct, o))
        except:
            pass

    if not com_desconto:
        print("Nenhuma oferta com desconto encontrada")
        return None

    com_desconto.sort(reverse=True, key=lambda x: x[0])
    return com_desconto[0][1]

def gerar_imagem_post(oferta):
    """Gera uma imagem bonita para o post"""
    # Dimensões Instagram: 1080x1350
    img = Image.new('RGB', (1080, 1350), color='#ffffff')
    draw = ImageDraw.Draw(img)

    # Tentar carregar fonte, fallback para padrão
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
        text_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except:
        title_font = ImageFont.load_default()
        text_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # Cores
    primary = '#2563eb'
    danger = '#ef4444'
    gray = '#374151'

    # Gradiente de fundo (simulado com retângulos)
    draw.rectangle([(0, 0), (1080, 675)], fill='#2563eb')
    draw.rectangle([(0, 675), (1080, 1350)], fill='#ffffff')

    # Desconto grande (vermelho)
    desconto_text = oferta.get('desconto', '0%')
    draw.text((540, 120), "🔥 OFERTA DO DIA 🔥", font=title_font, fill='white', anchor="mm")
    draw.text((540, 250), desconto_text, font=title_font, fill=danger, anchor="mm")

    # Título do produto
    titulo = oferta.get('titulo', '')[:50]
    draw.text((540, 550), titulo, font=text_font, fill='white', anchor="mm")

    # Info da loja
    loja = oferta.get('loja', 'Mercado Livre')
    draw.text((540, 800), f"📍 {loja}", font=text_font, fill=gray, anchor="mm")

    # Cupom
    cupom = oferta.get('cupom')
    if cupom:
        draw.rectangle([(100, 900), (980, 1000)], outline='#2563eb', width=2)
        draw.text((540, 950), f"Cupom: {cupom}", font=text_font, fill='#2563eb', anchor="mm")

    # CTA
    draw.text((540, 1200), "Link na bio! 🔗", font=small_font, fill='#2563eb', anchor="mm")

    # Salvar
    img_path = '/tmp/post_insta.jpg'
    img.save(img_path, 'JPEG', quality=95)
    return img_path

def postar_no_instagram(img_path, oferta):
    """Publica no Instagram usando instagrapi"""
    try:
        client = Client()
        print(f"[Instagram] Fazendo login como {INSTA_USERNAME}...")
        client.login(INSTA_USERNAME, INSTA_PASSWORD)

        # Montar legenda
        titulo = oferta.get('titulo', '')[:80]
        desconto = oferta.get('desconto', '')
        loja = oferta.get('loja', '')
        cupom = oferta.get('cupom', '')
        link = oferta.get('link_afiliado', '')

        caption = f"""🔥 OFERTA DO DIA 🔥

{titulo}

💰 {desconto}
📍 {loja}"""

        if cupom:
            caption += f"\n🎟️ Cupom: {cupom}"

        caption += "\n\nLink na bio! 🔗\n\n#oferta #promoção #desconto #mercadolivre #economize #deals"

        print(f"[Instagram] Publicando post...")
        print(f"[Instagram] Legenda:\n{caption}\n")

        # Upload
        media = client.photo_upload(img_path, caption=caption)
        print(f"✅ Post publicado com sucesso! ID: {media.id}")
        return True

    except Exception as e:
        print(f"❌ Erro ao postar no Instagram: {e}")
        print(f"   Tipo: {type(e).__name__}")
        return False

def main():
    print("=" * 60)
    print("PromoHub — Post Instagram Automático")
    print("=" * 60)
    print(f"Data: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print()

    # Validar env vars
    if not all([SUPABASE_URL, SUPABASE_KEY, INSTA_USERNAME, INSTA_PASSWORD]):
        print("❌ Faltam variáveis de ambiente!")
        print(f"   SUPABASE_URL: {bool(SUPABASE_URL)}")
        print(f"   SUPABASE_KEY: {bool(SUPABASE_KEY)}")
        print(f"   INSTA_USERNAME: {bool(INSTA_USERNAME)}")
        print(f"   INSTA_PASSWORD: {bool(INSTA_PASSWORD)}")
        sys.exit(1)

    # Buscar oferta
    print("📊 Buscando melhor oferta...")
    oferta = buscar_melhor_oferta()

    if not oferta:
        print("❌ Nenhuma oferta encontrada")
        sys.exit(1)

    titulo_curto = oferta.get('titulo', '')[:60]
    print(f"✅ Oferta selecionada: [{oferta.get('desconto', '0%')}] {titulo_curto}")
    print()

    # Gerar imagem
    print("🎨 Gerando imagem...")
    img_path = gerar_imagem_post(oferta)
    print(f"✅ Imagem criada: {img_path}")
    print()

    # Postar
    print("📱 Postando no Instagram...")
    success = postar_no_instagram(img_path, oferta)

    if success:
        print()
        print("=" * 60)
        print("✅ SUCESSO! Post publicado no Instagram")
        print("=" * 60)
        sys.exit(0)
    else:
        print()
        print("=" * 60)
        print("❌ ERRO ao publicar no Instagram")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
