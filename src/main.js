import { Deck } from '@deck.gl/core';
import { COGLayer, COGSource } from '@developmentseed/deck.gl-geotiff';

// 告诉 index.html 的兜底逻辑：模块脚本已成功执行，不要弹静态预览提示。
window.__cogDemoBooted = true;

const COGS = {
  usgs: {
    title: 'USGS Emigrant Gap',
    url: 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/GeoTIFF/CA/CA_Emigrant%20Gap_297419_1955_62500_geo.tif',
    view: { longitude: -120.626, latitude: 39.367, zoom: 10 }
  },
  linz: {
    title: 'LINZ 新西兰影像',
    url: 'https://nz-imagery.s3-ap-southeast-2.amazonaws.com/new-zealand/new-zealand_2024-2025_10m/rgb/2193/CC11.tiff',
    view: { longitude: 174.0, latitude: -41.5, zoom: 11 }
  }
};

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const busyEl = $('busy');
const loadBtn = $('load');
let deck = null;
// 已打开的 COGSource 缓存：key -> { src, info }。
// 复用同一 source 对象可跳过 header 拉取与 CRS 解析，且避免瓦片重新开始加载。
const sources = new Map();
let lastView = null; // 当前数据源实际渲染使用的视角，复位时用
let tilesLoaded = 0;
let tilesErrored = 0;

function setStatus(msg, kind) {
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
  statusEl.innerHTML = msg;
}

function updateTileStats() {
  $('m-tiles').textContent = tilesErrored
    ? `${tilesLoaded}（失败 ${tilesErrored}）`
    : String(tilesLoaded);
  $('ov-tiles').textContent = String(tilesLoaded);
}

function describeSource(src) {
  const b = src.geographicBounds || {};
  const { west, east, south, north } = b;
  const hasBounds = [west, east, south, north].every(Number.isFinite);
  const center = hasBounds
    ? { longitude: (west + east) / 2, latitude: (south + north) / 2 }
    : null;

  $('m-bounds').textContent = hasBounds
    ? `${west.toFixed(3)}, ${south.toFixed(3)} ~ ${east.toFixed(3)}, ${north.toFixed(3)}`
    : '—';

  const tiff = src.geotiff;
  const tileSize = (tiff?.tileWidth && tiff?.tileHeight)
    ? `${tiff.tileWidth} × ${tiff.tileHeight}`
    : '—';
  $('m-tile').textContent = tileSize;

  return { center, bounds: b, hasBounds };
}

async function render(key) {
  const cfg = COGS[key];
  busyEl.classList.remove('hidden');
  loadBtn.disabled = true;
  setStatus('正在打开 COGSource…');
  $('ov-title').textContent = cfg.title;
  $('m-time').textContent = '—';
  $('m-tile').textContent = '—';
  $('m-bounds').textContent = '—';
  tilesLoaded = 0;
  tilesErrored = 0;
  updateTileStats();

  const openStart = performance.now();
  try {
    let entry = sources.get(key);
    let reused = Boolean(entry);
    if (!entry) {
      const src = await COGSource.open(cfg.url);
      entry = { src, info: describeSource(src) };
      sources.set(key, entry);
    } else {
      // 复用缓存的 source，同步刷新指标（describeSource 不再重算，直接用缓存 info）
      $('m-bounds').textContent = entry.info.hasBounds
        ? `${entry.info.bounds.west.toFixed(3)}, ${entry.info.bounds.south.toFixed(3)} ~ ${entry.info.bounds.east.toFixed(3)}, ${entry.info.bounds.north.toFixed(3)}`
        : '—';
    }
    const openMs = Math.round(performance.now() - openStart);
    $('m-tile').textContent = entry.src.geotiff?.tileWidth
      ? `${entry.src.geotiff.tileWidth} × ${entry.src.geotiff.tileHeight}`
      : '—';
    $('m-time').textContent = `${openMs} ms`;

    lastView = entry.info.hasBounds
      ? {
          longitude: entry.info.center.longitude,
          latitude: entry.info.center.latitude,
          zoom: cfg.view.zoom,
          pitch: 0,
          bearing: 0
        }
      : cfg.view;

    const layer = new COGLayer({
      id: `cog-${key}`,
      source: entry.src,
      onTileLoad: () => {
        tilesLoaded += 1;
        updateTileStats();
      },
      onTileError: () => {
        tilesErrored += 1;
        updateTileStats();
      }
    });

    if (!deck) {
      deck = new Deck({
        canvas: 'deck-canvas',
        initialViewState: lastView,
        controller: true,
        layers: [layer],
        onError: (err) => {
          setStatus(`<b>渲染错误</b><br>${err?.message || String(err)}`, 'err');
          busyEl.classList.add('hidden');
        }
      });
    } else {
      deck.setProps({ initialViewState: lastView, layers: [layer] });
    }

    setStatus(
      `<b>渲染就绪</b><br>${reused ? '复用已打开的 COGSource，跳过元数据读取。' : 'COGSource 已打开'}瓦片流式解码中。`,
      'ok'
    );
    $('m-layers').textContent = deck.props.layers.length;
    requestAnimationFrame(() => requestAnimationFrame(() => busyEl.classList.add('hidden')));
  } catch (err) {
    setStatus(`<b>加载失败</b><br>${err?.message || String(err)}`, 'err');
    busyEl.classList.add('hidden');
  } finally {
    loadBtn.disabled = false;
  }
}

$('load').addEventListener('click', () => render($('cog-select').value));
$('reset').addEventListener('click', () => {
  if (!deck) return;
  deck.setProps({ initialViewState: lastView || COGS[$('cog-select').value].view });
});

render('usgs');
