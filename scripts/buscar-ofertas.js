const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://jlvbbvvxwowarjsgoppn.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const AFFILIATE_ID = 'PESSANHALUIZGUILHERME'
const DESCONTO_MINIMO = 20

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CATEGORIAS = [
  { id: 'MLB1246', nome: 'Saude e Beleza' },
  { id: 'MLB1051', nome: 'Eletronicos' },
  { id: 'MLB1182', nome: 'Esporte e Fitness' },
  { id: 'MLB1276', nome: 'Casa e Deco' },
  { id: 'MLB1648', nome: 'Moda' },
]

function gerarLinkAfiliado(permalink) {
  const url = new URL(permalink)
  url.searchParams.set('matt_tool', AFFILIATE_ID)
  url.searchParams.set('matt_word', '')
  url.searchParams.set('matt_source', 'google')
  url.searchParams.set('matt_medium', 'affiliate')
  return url.toString()
}

function formatarPreco(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',')
}

async function buscarMaisVendidos(categoriaId, categoriaNome) {
  const url = `https://api.mercadolibre.com/sites/MLB/search?category=${categoriaId}&sort=sold_quantity_desc&limit=20`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Erro ML API: ${resp.status}`)
  const data = await resp.json()

  const produtos = []

  for (const p of (data.results || [])) {
    if (!p.original_price || p.price >= p.original_price) continue

    const desconto = Math.round((1 - p.price / p.original_price) * 100)
    if (desconto < DESCONTO_MINIMO) continue

    const precoAtual = formatarPreco(p.price)
    const precoOriginal = formatarPreco(p.original_price)
    const vendidos = p.sold_quantity ? `+${p.sold_quantity.toLocaleString('pt-BR')} vendidos` : ''

    produtos.push({
      loja: p.seller?.nickname || 'Mercado Livre',
      titulo: p.title,
      descricao: `De ${precoOriginal} por ${precoAtual}${vendidos ? ' · ' + vendidos : ''}`,
      desconto: `${desconto}% OFF`,
      link_afiliado: gerarLinkAfiliado(p.permalink),
      categoria: categoriaNome,
      imagem_url: (p.thumbnail || '').replace(/\bI\.jpg\b/, 'O.jpg') || null,
      ativo: true,
      ml_id: p.id,
    })
  }

  return produtos
}

async function main() {
  console.log('=== Buscando ofertas no Mercado Livre ===')
  console.log(`Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  console.log(`Afiliado: ${AFFILIATE_ID}`)
  console.log('')

  // Buscar IDs já cadastrados para evitar duplicatas
  const { data: existentes, error: errExistentes } = await supabase
    .from('promocoes')
    .select('ml_id')
    .not('ml_id', 'is', null)

  if (errExistentes) {
    console.error('Erro ao buscar existentes:', errExistentes.message)
    process.exit(1)
  }

  const idsExistentes = new Set((existentes || []).map(p => p.ml_id))
  console.log(`Produtos ja cadastrados: ${idsExistentes.size}`)
  console.log('')

  let totalInseridos = 0

  for (const cat of CATEGORIAS) {
    try {
      console.log(`Buscando: ${cat.nome}...`)
      const produtos = await buscarMaisVendidos(cat.id, cat.nome)
      const novos = produtos.filter(p => !idsExistentes.has(p.ml_id))

      if (novos.length === 0) {
        console.log(`  Sem novidades.`)
      } else {
        const { error } = await supabase.from('promocoes').insert(novos)
        if (error) {
          console.error(`  Erro ao inserir: ${error.message}`)
        } else {
          console.log(`  +${novos.length} oferta(s) inserida(s):`)
          novos.forEach(p => console.log(`    - [${p.desconto}] ${p.titulo.substring(0, 60)}...`))
          totalInseridos += novos.length
          novos.forEach(p => idsExistentes.add(p.ml_id))
        }
      }
    } catch (err) {
      console.error(`  Erro em ${cat.nome}: ${err.message}`)
    }

    // Delay entre categorias para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log('')
  console.log(`=== Concluido! ${totalInseridos} nova(s) oferta(s) adicionada(s). ===`)
}

main().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
