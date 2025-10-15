// Generate manifest for web directory only
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'web');
const OUT_MANIFEST = path.join(ROOT, 'parts.manifest.json');

function norm(str) { return String(str || '').normalize('NFC'); }

function inferLayerType(absFilePath) {
	const rel = path.relative(ROOT, absFilePath);
	const parts = rel.split(path.sep);
	const [top] = parts;
	
	// 특수 폴더 처리
	if (parts.length >= 2) {
		if (parts[1].includes('bappe') || parts[1].includes('베이쁘')) {
			return 'hair'; // bappe(red) 폴더도 hair로 분류
		}
		if (parts[1].includes('beret') || parts[1].includes('베레모')) {
			return 'hair'; // beret 폴더도 hair로 분류
		}
		if (parts[1].includes('beanie') || parts[1].includes('비니')) {
			return 'hair'; // beanie 폴더도 hair로 분류
		}
	}
	
	switch (top) {
		case 'hair':
			return 'hair';
		case 'face':
			return 'face_base';
		case 'cloth':
			return 'clothes';
		case 'accessory':
			return 'accessory';
		case 'hat':
			return 'hat';
		default:
			return top || 'unknown';
	}
}

function inferPartName(absFilePath) {
	const rel = path.relative(ROOT, absFilePath);
	const noExt = rel.replace(/\.(png|PNG)$/i, '');
	return noExt.split(path.sep).join(' / ');
}

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
			// 특정 하위 폴더는 포함 (렌더링에 필요)
			results.push(...walkPngFiles(full));
		} else if (entry.isFile() && entry.name.match(/\.(png|PNG)$/i)) {
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
		root: 'web',
		count: items.length,
		parts: items
	};
}

function main() {
	console.log('Scanning web directory:', ROOT);
	const pngFiles = walkPngFiles(ROOT);
	console.log('Found PNG files:', pngFiles.length);
	
	const manifest = generateManifest(pngFiles);
	fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
	
	console.log(`Generated ${OUT_MANIFEST}`);
	console.log(`Total parts: ${manifest.count}`);
	
	// 디버깅: 각 레이어 타입별 개수
	const byType = {};
	manifest.parts.forEach(p => {
		byType[p.layerType] = (byType[p.layerType] || 0) + 1;
	});
	console.log('Parts by type:', byType);
}

main();

