const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const https = require('https')
const path = require('path')

const SUPABASE_URL = 'https://jlvbbvvxwowarjsgoppn.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const INSTA_USERNAME = process.env.INSTA_USERNAME || 'eita__bexiga'
const INSTA_PASSWORD = process.env.INSTA_PASSWORD

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Helper para baixar imagem
async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, response => {
      response.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

// Gerar imagem com texto usando Canvas (Node.js)
async function generatePostImage(produto) {
  // Usar uma library como 'sharp' ou 'canvas'
  // Por enquanto, vamos usar uma abordagem simplificada com URL de imagem
  return produto.imagem_url || 'https://via.placeholder.com/1080x1350?text=Promo'
}

// Postar no Instagram via instagrapi (Python)
async function postarNoInstagram(imagemPath, caption) {
  const { execSync } = require('child_process')
  try {
    // Usar script Python para postar (instagrapi é mais confiável que JS)
    const pythonScript = `
import sys
sys.path.insert(0, '/usr/local/lib/python3.11/site-packages')
from instagrapi import Client

username = '${INSTA_USERNAME}'
password = '${INSTA_PASSWORD}'
image_path = '${imagemPath}'
caption = '''${caption}'''

try:
    client = Client()
    client.login(username, password)
    client.photo_upload(image_path, caption=caption)
    print('✓ Post publicado com sucesso!')
except Exception as e:
    print(f'✗ Erro ao postar: {e}')
    sys.exit(1)
`

    fs.writeFileSync('/tmp/insta_post.py', pythonScript)
    execSync('python3 /tmp/insta_post.py', { stdio: 'inherit' })
  } catch (err) {
    console.error('Erro ao postar no Instagram:', err.message)
    throw err
  }
}

async function main() {
  console.log('=== PromoHub — Post Instagram Automático ===')
  console.log(`Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  console.log('')

  // Buscar melhor oferta (maior desconto)
  console.log('Buscando melhor oferta...')
  const { data: ofertas, error } = await supabase
    .from('promocoes')
    .select('*')
    .eq('ativo', true)
    .order('criado_em', { ascending: false })
    .limit(50)

  if (error || !ofertas?.length) {
    console.error('Erro ao buscar ofertas:', error)
    process.exit(1)
  }

  // Extrair percentual de desconto e pegar a maior
  const comDesconto = ofertas
    .map(p => ({
      ...p,
      desconto_pct: parseInt(p.desconto || '0')
    }))
    .filter(p => p.desconto_pct > 0)
    .sort((a, b) => b.desconto_pct - a.desconto_pct)

  if (!comDesconto.length) {
    console.log('Nenhuma oferta com desconto encontrada.')
    process.exit(0)
  }

  const oferta = comDesconto[0]
  console.log(`Oferta selecionada: [${oferta.desconto}] ${oferta.titulo.substring(0, 60)}`)

  // Gerar legenda
  const caption = `🔥 OFERTA DO DIA 🔥

${oferta.titulo}

💰 ${oferta.desconto}
📍 ${oferta.loja}
${oferta.cupom ? `🎟️ Cupom: ${oferta.cupom}` : ''}

Link na bio! 🔗

#oferta #promoção #desconto #mercadolivre #economize #deals #promo`

  console.log('\nLegenda:')
  console.log(caption)

  // Nota: Na versão real, seria necessário:
  // 1. Usar 'sharp' para gerar uma imagem bonita com os dados da oferta
  // 2. Implementar autenticação segura do Instagram
  // 3. Usar a biblioteca 'instagrapi' via Python (mais confiável)

  console.log('\n⚠️ NOTA: Para publicar no Instagram automaticamente, é necessário:')
  console.log('  1. Instalar Python + instagrapi')
  console.log('  2. Configurar 2FA do Instagram')
  console.log('  3. Usar app-specific password')
  console.log('\nPor enquanto, esta é a legenda que seria postada.')
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
