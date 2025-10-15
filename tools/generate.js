// Minimal Node.js script to scan PNG parts and generate a manifest and a preview gallery
// Assumes no external dependencies.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_MANIFEST = path.join(ROOT, 'parts.manifest.json');
const OUT_PREVIEW = path.join(ROOT, 'preview.html');

function norm(str) { return String(str || '').normalize('NFC'); }

/**
 * Derive layer type from the first-level folder name.
 */
function inferLayerType(absFilePath) {
	const rel = path.relative(ROOT, absFilePath);
	const parts = rel.split(path.sep);
	const [top] = parts;
	
	// 베이쁘(red) 폴더의 머리 파일들은 특별한 레이어 타입으로 처리
	if (parts.length >= 2 && parts[1].includes('베이쁘')) {
		console.log('베이쁘 폴더 파일 발견:', rel);
		return 'beauty_red_hair';
	}
	
	// Normalize common Korean folder names
	switch (top) {
		case '머리':
		case '머리':
			return 'hair';
		case '머리2':
			return 'hair2';
		case '얼굴 베이스':
			return 'face_base';
		case '옷':
		case 'cloth':
			return 'clothes';
		case '눈':
			return 'eyes';
		case '입':
			return 'mouth';
		case 'accessory':
			return 'accessory';
		case 'hat':
			return 'hat';
		default:
			return top || 'unknown';
	}
}

/**
 * Guess a human-friendly part name from path
 */
function inferPartName(absFilePath) {
	const rel = path.relative(ROOT, absFilePath);
	const noExt = rel.replace(/\\.png$/i, '');
	return noExt.split(path.sep).join(' / ');
}

/**
 * Heuristic: mark tintable if filename suggests a color layer
 */
function inferTintable(fileName) {
	const lower = fileName.toLowerCase();
	return [
		'cloth_color', 'hair_color', 'skin_color', 'eye_color', 'sclera_color', 'color', 'tint'
	].some(key => lower.includes(key));
}

function walkPngFiles(dir) {
	const results = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// ice_beanie 폴더는 제외 (렌더링용으로만 사용)
			if (!entry.name.includes('ice_beanie')) {
				// 베이쁘(red) 폴더 디버깅
				if (entry.name.includes('베이쁘')) {
					console.log('베이쁘 폴더 발견:', full);
				}
				results.push(...walkPngFiles(full));
			}
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
			results.push(full);
		}
	}
	return results;
}

function generateManifest(files) {
	const items = files.map((absPath, idx) => {
		const layerType = inferLayerType(absPath);
		const relPath = path.relative(ROOT, absPath).split(path.sep).join('/');
		const fileName = path.basename(absPath);
		return {
			id: `${layerType}-${idx}`,
			layerType,
			name: inferPartName(absPath),
			filePath: relPath,
			format: 'png',
			tintable: inferTintable(fileName),
			tags: []
		};
	});
	return {
		generatedAt: new Date().toISOString(),
		root: path.basename(ROOT),
		count: items.length,
		parts: items
	};
}

// Build assembled groups for clothes by grouping sibling PNGs under the same clothes subfolder
function buildClothesAssemblies(files) {
	const assemblies = [];
	const groups = new Map();
	for (const abs of files) {
		if (inferLayerType(abs) !== 'clothes') continue;
		const rel = path.relative(ROOT, abs);
		const parts = rel.split(path.sep);
		// Expect structure: 옷/<의상 폴더>/file.png
		if (parts.length < 3) continue;
		const groupKey = parts.slice(0, 2).join(path.sep); // e.g., 옷/지뢰
		if (!groups.has(groupKey)) groups.set(groupKey, []);
		groups.get(groupKey).push(abs);
	}
	// Default order variants requested (bottom -> top, outline forced last):
	// A) skin_color -> cloth_color -> cloth_color_bg -> outline
	// B) skin_color -> cloth_color -> cloth_color_bg2 -> cloth_color_bg1 -> outline
	const baseOrderA = ['skin_color', 'cloth_color', 'cloth_color_bg'];
	const baseOrderB = ['skin_color', 'cloth_color', 'cloth_color_bg2', 'cloth_color_bg1'];
	const scoreWithOrder = (orderArr, name) => {
		const lower = name.toLowerCase();
		if (lower.includes('outline')) return 1e6; // always last (top)
		for (let i = 0; i < orderArr.length; i++) {
			if (lower.includes(orderArr[i])) return i;
		}
		// Unknowns go just before outline but after known layers
		return orderArr.length + 1000;
	};
	for (const [key, list] of groups.entries()) {
		if (list.length < 2) continue; // skip folders with single file (likely variants)
		const folderName = norm(key.split(path.sep)[1]);
		// Choose order set based on presence of bg1/bg2 files in the folder
		const names = list.map(p => path.basename(p).toLowerCase());
		const hasBg2 = names.some(n => n.includes('cloth_color_bg2'));
		const hasBg1 = names.some(n => n.includes('cloth_color_bg1'));
		let order = baseOrderA;
		if (hasBg2 || hasBg1) order = baseOrderB;
		// Custom order for 지뢰 exactly matches B already
		if (folderName === '지뢰') {
			order = ['skin_color', 'cloth_color', 'cloth_color_bg2', 'cloth_color_bg1'];
		}
		const sorted = list.slice().sort((a, b) => {
			const sa = scoreWithOrder(order, path.basename(a));
			const sb = scoreWithOrder(order, path.basename(b));
			if (sa !== sb) return sa - sb;
			return path.basename(a).localeCompare(path.basename(b));
		});
		assemblies.push({
			key,
			group: key.split(path.sep).slice(1).join(' / '),
			files: sorted.map(f => path.relative(ROOT, f).split(path.sep).join('/'))
		});
	}
	return assemblies;
}

// Build a default face base stack using explicit requested order (reversed as per latest):
// bottom skin_color1 -> sclera white -> eye blue -> top normal_base
function buildDefaultFaceStack(files) {
	const faceFiles = files.filter(f => inferLayerType(f) === 'face_base');
	function findExact(subdir, filename) {
		const rels = faceFiles
			.map(p => path.relative(ROOT, p).split(path.sep).join('/'))
			.filter(r => r.split('/')[1] === subdir);
		const exact = rels.find(r => r.toLowerCase().endsWith(`/${filename.toLowerCase()}`));
		if (exact) return exact;
		rels.sort();
		return rels[0] || null;
	}
	function findRoot(filename) {
		const rels = faceFiles.map(p => path.relative(ROOT, p).split(path.sep).join('/'));
		const exact = rels.find(r => r.toLowerCase().endsWith(`/${filename.toLowerCase()}`));
		return exact || null;
	}
	const normalBase = findRoot('normal_base.png');
	const eyeBlue = findExact('eye_color', 'blue.png');
	const scleraWhite = findExact('sclera_color', 'white.png');
	const skin1 = findExact('skin_color', 'skin_color1.png');
	return [skin1, scleraWhite, eyeBlue, normalBase].filter(Boolean);
}

// Build hair groups: ordered layers without face base
function buildHairGroups(files) {
	const hairFiles = files.filter(f => inferLayerType(f) === 'hair');
	const groups = new Map(); // key: 머리/<스타일>
	for (const abs of hairFiles) {
		const rel = path.relative(ROOT, abs).split(path.sep).join('/');
		const parts = rel.split('/');
		if (parts.length < 3) continue;
		const key = parts.slice(0, 2).join('/');
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(rel);
	}
	// Order with outline guaranteed last (top)
	const order = ['skin_shadow', 'hair_color_bg', 'hair_color', 'skin_color'];
	const score = name => {
		const lower = name.toLowerCase();
		if (lower.includes('outline')) return 1e6; // always last/top
		for (let i = 0; i < order.length; i++) {
			if (lower.includes(order[i])) return i;
		}
		// Put unknowns just before outline by giving them high but < 1e6 score
		return 9e5;
	};
	const result = [];
	for (const [key, list] of groups.entries()) {
		const sortedHair = list.slice().sort((a, b) => score(a) - score(b) || a.localeCompare(b));
		result.push({ key, group: key.split('/').slice(1).join(' / '), files: sortedHair });
	}
	return result;
}

// Build hair over face assemblies (kept for tab)
function buildHairAssemblies(files) {
	const faceStack = buildDefaultFaceStack(files);
	if (!faceStack.length) return [];
	return buildHairGroups(files).map(g => ({ group: g.group, files: [...faceStack, ...g.files] }));
}

// Build same-folder assemblies: group PNGs that share the same directory, with custom order (skin/hair/cloth... then outline on top)
function buildSameFolderAssemblies(files) {
	const map = new Map(); // dirRel -> [fileRel]
	for (const abs of files) {
		const rel = path.relative(ROOT, abs).split(path.sep).join('/');
		const dir = rel.split('/').slice(0, -1).join('/');
		if (!map.has(dir)) map.set(dir, []);
		map.get(dir).push(rel);
	}
	// Default scoring honoring requested sequences; outline still forced last
	const order = [
		'skin_shadow', 'hair_color_bg', 'hair_color', 'skin_color',
		// clothes sequences
		'skin_color', 'cloth_color', 'cloth_color_bg2', 'cloth_color_bg1', 'cloth_color_bg',
		'cloth_color_inner', 'wheel_color', 'bag_color', 'color', 'tint'
	];
	const score = name => {
		const lower = name.toLowerCase();
		if (lower.includes('outline')) return 1e6; // always last (top)
		for (let i = 0; i < order.length; i++) {
			if (lower.includes(order[i])) return i;
		}
		return order.length + 1000;
	};
	const assemblies = [];
	for (const [dir, list] of map.entries()) {
		if (list.length < 2) continue; // need at least 2 to assemble
		const sorted = list.slice().sort((a, b) => score(a) - score(b) || a.localeCompare(b));
		const groupName = dir.split('/').slice(-1)[0];
		assemblies.push({ group: dir, label: groupName, files: sorted });
	}
	return assemblies;
}

// Build combined assemblies: face base + hair group + clothes group (cross product)
function buildCombinedAssemblies(files) {
	const faceStack = buildDefaultFaceStack(files);
	if (!faceStack.length) return [];
	const hairGroups = buildHairGroups(files);
	const clothesGroups = buildClothesAssemblies(files);
	const combos = [];
	for (const h of hairGroups) {
		for (const c of clothesGroups) {
			combos.push({
				group: `${h.group} + ${c.group}`,
				files: [...faceStack, ...h.files, ...c.files]
			});
		}
	}
	return combos;
}

function generatePreviewHtml(files) {
	const rows = files.map(absPath => {
		const rel = path.relative(ROOT, absPath).split(path.sep).join('/');
		const name = inferPartName(absPath);
		const layer = inferLayerType(absPath);
		return `
		<div class="card" data-layer="${escapeHtml(layer)}">
			<div class="thumb">
				<img src="${encodeURI(rel)}" alt="${escapeHtml(name)}" loading="lazy" />
			</div>
			<div class="meta">
				<div class="name">${escapeHtml(name)}</div>
				<div class="layer">${escapeHtml(layer)}</div>
			</div>
		</div>`;
	}).join('\n');

	const clothesAssemblies = buildClothesAssemblies(files);
	const asmRows = clothesAssemblies.map(asm => {
		const stackImgs = asm.files.map(src => `<img src="${encodeURI(src)}" alt="" loading="lazy" />`).join('');
		return `
		<div class="card assembled" data-layer="clothes">
			<div class="thumb stack">${stackImgs}</div>
			<div class="meta">
				<div class="name">옷 / ${escapeHtml(asm.group)}</div>
				<div class="layer">assembled</div>
			</div>
		</div>`;
	}).join('\n');

	const hairAssemblies = buildHairAssemblies(files);
	const hairRows = hairAssemblies.map(asm => {
		const stackImgs = asm.files.map(src => `<img src="${encodeURI(src)}" alt="" loading="lazy" />`).join('');
		return `
		<div class="card assembled" data-layer="hair_face">
			<div class="thumb stack">${stackImgs}</div>
			<div class="meta">
				<div class="name">머리 + 얼굴 / ${escapeHtml(asm.group)}</div>
				<div class="layer">assembled</div>
			</div>
		</div>`;
	}).join('\n');

	const sameFolderAssemblies = buildSameFolderAssemblies(files);
	const sameFolderRows = sameFolderAssemblies.map(asm => {
		const stackImgs = asm.files.map(src => `<img src="${encodeURI(src)}" alt="" loading="lazy" />`).join('');
		return `
		<div class="card assembled" data-layer="same_folder">
			<div class="thumb stack">${stackImgs}</div>
			<div class="meta">
				<div class="name">${escapeHtml(asm.label)}</div>
				<div class="layer">same-folder</div>
			</div>
		</div>`;
	}).join('\n');

	const fullAssemblies = buildCombinedAssemblies(files);
	const fullRows = fullAssemblies.map(asm => {
		const stackImgs = asm.files.map(src => `<img src="${encodeURI(src)}" alt="" loading="lazy" />`).join('');
		return `
		<div class="card assembled" data-layer="full">
			<div class="thumb stack">${stackImgs}</div>
			<div class="meta">
				<div class="name">전체 / ${escapeHtml(asm.group)}</div>
				<div class="layer">full</div>
			</div>
		</div>`;
	}).join('\n');

	return `<!doctype html>
<html lang="ko">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>MELL Parts Preview</title>
	<style>
		:root { --bg:#ffffff; --card:#f7f7f9; --text:#111111; --muted:#667085; --grid: 240px; }
		* { box-sizing: border-box; }
		body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', Arial, sans-serif; }
		header { position: sticky; top:0; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(255,255,255,.9)); padding: 12px 16px; backdrop-filter: blur(8px); z-index: 10; border-bottom: 1px solid #e5e7eb; }
		header h1 { margin: 0; font-size: 16px; }
		.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(var(--grid), 1fr)); padding: 16px; }
		.card { background: var(--card); border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
		.thumb { background: #ffffff; aspect-ratio: 1 / 1; display: grid; place-items: center; position: relative; }
		.thumb img { max-width: 100%; max-height: 100%; image-rendering: -webkit-optimize-contrast; }
		.thumb.stack img { position: absolute; inset: 0; margin: auto; width: 100%; height: 100%; object-fit: contain; }
		.meta { padding: 10px 12px; display: flex; justify-content: space-between; gap: 8px; }
		.name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
		.layer { color: var(--muted); font-variant: all-small-caps; }
		.controls { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
		select, input[type="search"], button { background: #ffffff; color: var(--text); border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 8px; }
		.tabs { display: inline-flex; gap: 8px; flex-wrap: wrap; }
		button[aria-pressed="true"] { background: #eef2ff; border-color: #c7d2fe; }
		section { display: none; }
		section[aria-hidden="false"] { display: block; }
	</style>
</head>
<body>
	<header>
		<h1>MELL Parts Preview</h1>
		<div class="controls">
			<div class="tabs">
				<button id="tabAll" aria-pressed="true">모든 파츠</button>
				<button id="tabAsm" aria-pressed="false">조립(옷)</button>
				<button id="tabHairAsm" aria-pressed="false">조립(머리+얼굴)</button>
				<button id="tabSame" aria-pressed="false">조립(같은 폴더)</button>
				<button id="tabFull" aria-pressed="false">조립(전체)</button>
			</div>
			<label>
				<span>Layer</span>
				<select id="layerFilter">
					<option value="">All</option>
					<option value="hair">hair</option>
					<option value="face_base">face_base</option>
					<option value="clothes">clothes</option>
					<option value="eyes">eyes</option>
					<option value="mouth">mouth</option>
					<option value="hair_face">hair+face</option>
					<option value="same_folder">same-folder</option>
					<option value="full">full</option>
				</select>
			</label>
			<input id="search" type="search" placeholder="검색: 이름 포함" />
		</div>
	</header>
	<section id="secAll" aria-hidden="false">
		<main class="grid" id="grid">${rows}</main>
	</section>
	<section id="secAsm" aria-hidden="true">
		<main class="grid" id="gridAsm">${asmRows || '<div style="opacity:.7">조립 가능한 옷 파츠 묶음을 찾지 못했습니다.</div>'}</main>
	</section>
	<section id="secHairAsm" aria-hidden="true">
		<main class="grid" id="gridHairAsm">${hairRows || '<div style="opacity:.7">머리 또는 얼굴 베이스가 부족합니다.</div>'}</main>
	</section>
	<section id="secSame" aria-hidden="true">
		<main class="grid" id="gridSame">${sameFolderRows || '<div style="opacity:.7">같은 폴더에 2개 이상 PNG가 있는 세트를 찾지 못했습니다.</div>'}</main>
	</section>
	<section id="secFull" aria-hidden="true">
		<main class="grid" id="gridFull">${fullRows || '<div style="opacity:.7">결합 가능한 조합이 없습니다.</div>'}</main>
	</section>
	<script>
	const secAll = document.getElementById('secAll');
	const secAsm = document.getElementById('secAsm');
	const secHairAsm = document.getElementById('secHairAsm');
	const secSame = document.getElementById('secSame');
	const secFull = document.getElementById('secFull');
	const tabAll = document.getElementById('tabAll');
	const tabAsm = document.getElementById('tabAsm');
	const tabHairAsm = document.getElementById('tabHairAsm');
	const tabSame = document.getElementById('tabSame');
	const tabFull = document.getElementById('tabFull');
	const grid = document.getElementById('grid');
	const gridAsm = document.getElementById('gridAsm');
	const gridHairAsm = document.getElementById('gridHairAsm');
	const gridSame = document.getElementById('gridSame');
	const gridFull = document.getElementById('gridFull');
	const layerFilter = document.getElementById('layerFilter');
	const search = document.getElementById('search');

	function switchTab(tab){
		const isAsm = tab === 'asm';
		const isHairAsm = tab === 'hairAsm';
		const isSame = tab === 'same';
		const isFull = tab === 'full';
		secAll.setAttribute('aria-hidden', String(isAsm || isHairAsm || isSame || isFull));
		secAsm.setAttribute('aria-hidden', String(!isAsm));
		secHairAsm.setAttribute('aria-hidden', String(!isHairAsm));
		secSame.setAttribute('aria-hidden', String(!isSame));
		secFull.setAttribute('aria-hidden', String(!isFull));
		tabAll.setAttribute('aria-pressed', String(!isAsm && !isHairAsm && !isSame && !isFull));
		tabAsm.setAttribute('aria-pressed', String(isAsm));
		tabHairAsm.setAttribute('aria-pressed', String(isHairAsm));
		tabSame.setAttribute('aria-pressed', String(isSame));
		tabFull.setAttribute('aria-pressed', String(isFull));
	}
		tabAll.addEventListener('click', () => switchTab('all'));
		tabAsm.addEventListener('click', () => switchTab('asm'));
		tabHairAsm.addEventListener('click', () => switchTab('hairAsm'));
		tabSame.addEventListener('click', () => switchTab('same'));
		tabFull.addEventListener('click', () => switchTab('full'));

	function applyFilters(){
		const layer = layerFilter.value;
		const q = search.value.toLowerCase();
		for(const container of [grid, gridAsm, gridHairAsm, gridSame, gridFull]){
			if(!container) continue;
			for(const card of container.children){
				const nameEl = card.querySelector('.name');
				const name = nameEl ? nameEl.textContent.toLowerCase() : '';
				const cardLayer = card.getAttribute('data-layer') || '';
				const matchLayer = !layer || layer === cardLayer;
				const matchText = !q || name.includes(q);
				card.style.display = matchLayer && matchText ? '' : 'none';
			}
		}
	}
	layerFilter.addEventListener('change', applyFilters);
	search.addEventListener('input', applyFilters);
	</script>
</body>
</html>`;
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function main() {
	const pngFiles = walkPngFiles(ROOT);
	const manifest = generateManifest(pngFiles);
	fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
	const html = generatePreviewHtml(pngFiles);
	fs.writeFileSync(OUT_PREVIEW, html, 'utf8');
	console.log(`Generated ${OUT_MANIFEST}`);
	console.log(`Generated ${OUT_PREVIEW}`);
	console.log(`Found PNG files: ${manifest.count}`);
}

main();
