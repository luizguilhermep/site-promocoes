const ws = require('ws')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://jlvbbvvxwowarjsgoppn.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const AFFILIATE_ID = '67560958'
const DESCONTO_MINIMO = 15
const ML_CLIENT_ID = process.env.ML_CLIENT_ID || '4665668902086371'
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'lsUoUlyAon8gD0qMQpmXAdblR7oPRLwG'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws }
})

const CATEGORIAS_ML = {
  MLB1055: 'Eletronicos',
  MLB1051: 'Eletronicos',
  MLB1648: 'Moda',
  MLB1246: 'Saude e Beleza',
  MLB1182: 'Esporte e Fitness',
  MLB1574: 'Casa e Deco',
  MLB1276: 'Casa e Deco',
  MLB1144: 'Eletronicos',
  MLB1000: 'Eletronicos',
}

// 1. Autenticar no ML com client_credentials
async function getMLToken() {
  const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${ML_CLIENT_ID}&client_secret=${ML_CLIENT_SECRET}`
  })
  const data = await resp.json()
  if (!data.access_token) throw new Error('Falha ao obter token: ' + JSON.stringify(data))
  return data.access_token
}

// 2. Buscar IDs de catalogo da pagina de ofertas do ML
async function buscarCatalogIdsDeOfertas() {
  const resp = await fetch('https://www.mercadolivre.com.br/ofertas', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  const html = await resp.text()
  const matches = [...html.matchAll(/mercadolivre\.com\.br\/[^/]+\/p\/(MLB\d+)/g)]
  const ids = [...new Set(matches.map(m => m[1]))]
  return ids
}

// 3. Buscar detalhes do produto via products API
async function buscarProduto(catalogId, token) {
  const resp = await fetch(`https://api.mercadolibre.com/products/${catalogId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  return await resp.json()
}

// 4. Buscar o melhor preco do produto
async function buscarMelhorPreco(catalogId, token) {
  const resp = await fetch(`https://api.mercadolibre.com/products/${catalogId}/items`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!resp.ok) return null
  const data = await resp.json()
  const items = data.results || []

  // Pegar item com menor preco e que tenha preco original
  const comDesconto = items.filter(i => i.original_price && i.price < i.original_price)
  if (!comDesconto.length) return null

  comDesconto.sort((a, b) => a.price - b.price)
  return comDesconto[0]
}

function formatarPreco(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',')
}

function gerarLinkAfiliado(permalink, catalogId) {
  const base = permalink || `https://www.mercadolivre.com.br/p/${catalogId}`
  const url = new URL(base)
  url.searchParams.set('matt_tool', AFFILIATE_ID)
  url.searchParams.set('matt_source', 'affiliate')
  return url.toString()
}

function inferirCategoria(categoryId) {
  return CATEGORIAS_ML[categoryId] || 'Variado'
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('=== PromoHub — Busca Automatica de Ofertas ===')
  console.log(`Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  console.log('')

  // Auth
  console.log('Autenticando no Mercado Livre...')
  const token = await getMLToken()
  console.log('Token obtido!')

  // Catalog IDs ja cadastrados
  const { data: existentes } = await supabase
    .from('promocoes').select('ml_id').not('ml_id', 'is', null)
  const idsExistentes = new Set((existentes || []).map(p => p.ml_id))
  console.log(`Produtos ja no banco: ${idsExistentes.size}`)
  console.log('')

  // Buscar IDs da pagina de ofertas
  console.log('Buscando produtos da pagina de ofertas do ML...')
  const catalogIds = await buscarCatalogIdsDeOfertas()
  console.log(`IDs encontrados: ${catalogIds.length}`)

  const novos = catalogIds.filter(id => !idsExistentes.has(id))
  console.log(`Novos para processar: ${novos.length}`)
  console.log('')

  let totalInseridos = 0

  for (const catalogId of novos) {
    try {
      // Detalhes do produto
      const produto = await buscarProduto(catalogId, token)
      if (!produto) { console.log(`  [SKIP] ${catalogId} — sem dados`); continue }

      // Melhor preco
      const item = await buscarMelhorPreco(catalogId, token)
      if (!item) { console.log(`  [SKIP] ${produto.name?.substring(0,40)} — sem desconto`); continue }

      const desconto = Math.round((1 - item.price / item.original_price) * 100)
      if (desconto < DESCONTO_MINIMO) {
        console.log(`  [SKIP] ${desconto}% — abaixo do minimo`)
        continue
      }

      const imagem = produto.pictures?.[0]?.url?.replace(/\bI\.jpg\b/, 'O.jpg') || null
      const categoria = inferirCategoria(item.category_id)
      const permalink = produto.permalink || ''

      const registro = {
        loja: 'Mercado Livre',
        titulo: produto.name,
        descricao: `De ${formatarPreco(item.original_price)} por ${formatarPreco(item.price)}`,
        desconto: `${desconto}% OFF`,
        link_afiliado: gerarLinkAfiliado(permalink, catalogId),
        categoria,
        imagem_url: imagem,
        ativo: true,
        ml_id: catalogId,
      }

      const { error } = await supabase.from('promocoes').insert(registro)
      if (error) {
        console.log(`  [ERRO] ${produto.name?.substring(0,40)}: ${error.message}`)
      } else {
        console.log(`  [+${desconto}% OFF] ${produto.name?.substring(0,50)}`)
        totalInseridos++
        idsExistentes.add(catalogId)
      }

      await sleep(800)
    } catch (err) {
      console.log(`  [ERRO] ${catalogId}: ${err.message}`)
    }
  }

  console.log('')
  console.log(`=== Concluido! ${totalInseridos} nova(s) oferta(s) adicionada(s). ===`)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
