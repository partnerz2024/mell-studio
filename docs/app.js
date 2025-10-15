// Simple HTML app that loads parts.manifest.json and composes hair+clothes over face

const ROOT = '';
const MANIFEST_URL = 'parts.manifest.json';
const ASSETS = 'mell_studio_asset'; // served from site root

const FRAME_OFFSET_RATIO_X = 0; // 프레임 중앙 정렬
const FRAME_OFFSET_RATIO_Y = 0;  // 프레임 중앙 정렬
const FRAME_HEIGHT_RATIO   = 0.8;   // 프레임을 더 크게 (0.6 → 0.8)
// 폴라로이드 프레임 내부 사진 영역(원본 프레임 이미지 비율 기준 인셋)
const PHOTO_INSET = { left: 0.07, top: 0.06, right: 0.07, bottom: 0.28 };
// 캐릭터 확대 배율(1.0 = 내부 영역을 꽉 채움, >1 확대)
const CHARACTER_SCALE = 1.15;

const hairOrder = ['skin_shadow','hair_color_bg','hair_color','skin_color','outline'];
const clothesOrderA = ['skin_color','cloth_color','cloth_color_bg','outline'];
const clothesOrderB = ['skin_color','cloth_color','cloth_color_bg2','cloth_color_bg1','outline'];

const state = {
	manifest: null,
	faceStack: [],
	hairOptions: [],
	clothesOptions: [],
	accessoryOptions: [],
	hatOptions: [],
	eyeOptions: [],
	eyeColorOptions: [],
	mouthOptions: [],
	selectedHair: null,
	selectedClothes: null,
	selectedAccessory: null,
	selectedHat: null,
	selectedEye: null,
	selectedEyeColor: null,
	selectedMouth: null,
	imageCache: new Map(), // 이미지 캐시
	excludedHairBaseNames: [], // 머리 옵션에서 제외할 기본 이름 목록
	renderTimeout: null, // 렌더링 디바운싱용
};

// 디바운스된 렌더링 (빠른 연속 변경 시 마지막 것만 렌더링)
function debouncedRender() {
	if (state.renderTimeout) {
		cancelAnimationFrame(state.renderTimeout);
	}
	state.renderTimeout = requestAnimationFrame(() => {
		render();
		state.renderTimeout = null;
	});
}

function byLayer(parts, layer) { return parts.filter(p => p.layerType === layer); }
function rel(url) { 
	// URL의 모든 경로 부분을 개별적으로 인코딩
	return url.split('/').map(part => encodeURIComponent(part)).join('/');
}

async function loadManifest(){
	const res = await fetch(MANIFEST_URL);
	state.manifest = await res.json();
}

function pickFaceStack(){
	const files = state.manifest.parts;
	const face = byLayer(files,'face_base');
	const find = (sub, name) => face.map(p=>p.filePath).find(p=>p.split('/')[1]===sub && p.toLowerCase().endsWith('/'+name));
	const normal = face.map(p=>p.filePath).find(p=>p.toLowerCase().endsWith('/normal_base.png'));
	const eyeBlue = find('eye_color','blue.png') || face.map(p=>p.filePath).find(p=>p.includes('eye_color/'));
	const scleraWhite = find('sclera_color','white.png') || face.map(p=>p.filePath).find(p=>p.includes('sclera_color/'));
	const skin1 = find('skin_color','skin_color1.png') || face.map(p=>p.filePath).find(p=>p.includes('skin_color/'));
	// bottom -> top
	state.faceStack = [skin1, scleraWhite, eyeBlue, normal].filter(Boolean);
}

function groupByFolder(parts, layer){
	const map = new Map();
	for(const p of parts){
		if(p.layerType!==layer) continue;
		const dir = p.filePath.split('/').slice(0,2).join('/');
		if(!map.has(dir)) map.set(dir, []);
		map.get(dir).push(p);
	}
	return [...map.entries()].map(([dir,items])=>({dir,items}));
}

function sortByOrder(list, order){
	return list.slice().sort((a,b)=>{
		const na=a.filePath.toLowerCase();const nb=b.filePath.toLowerCase();
		const sa = na.includes('outline')?1e6: order.findIndex(k=>na.includes(k));
		const sb = nb.includes('outline')?1e6: order.findIndex(k=>nb.includes(k));
		const va = sa<0? order.length+1000:sa; const vb = sb<0? order.length+1000:sb;
		if(va!==vb) return va-vb; return na.localeCompare(nb);
	});
}

function buildOptions(){
	const files = state.manifest.parts;
	
	// 머리는 hair 루트 바로 아래의 파일만 표시 (하위 폴더는 자동 전환용)
	// 하위 폴더들: bappe(red) / ice_beanie / normal_beanie
	const hairFiles = files.filter(p => {
		if (p.layerType !== 'hair') return false;
		const path = p.filePath;
		if (!path.startsWith('hair/')) return false;
		// 루트 바로 아래만 허용 (하위 폴더 제외)
		if (path.split('/').length !== 2) return false;
		return true;
	});
	state.hairOptions = hairFiles.map(p => ({
		label: p.name.split(' / ').pop().replace(/\.(png|PNG)$/i, ''),
		files: [p.filePath]
	}));
	
	// 옷도 cloth 폴더의 개별 파일로 처리
	const clothFiles = files.filter(p => p.layerType === 'clothes');
	state.clothesOptions = clothFiles.map(p => ({
		label: p.name.split(' / ').pop().replace(/\.(png|PNG)$/i, ''),
		files: [p.filePath]
	}));
	
	// 액세서리도 개별 파일로 처리
	const accessoryFiles = files.filter(p => p.layerType === 'accessory');
	state.accessoryOptions = accessoryFiles.map(p => ({
		label: p.name.split(' / ').pop().replace(/\.(png|PNG)$/i, ''),
		files: [p.filePath]
	}));
	
	// 모자도 개별 파일로 처리
	const hatFiles = files.filter(p => p.layerType === 'hat');
	state.hatOptions = hatFiles.map(p => ({
		label: p.name.split(' / ').pop().replace(/\.(png|PNG)$/i, ''),
		files: [p.filePath]
	}));
	
	// 눈 타입 (face/basic/eye 폴더에서 직접 로드)
	state.eyeOptions = [
		{ label: '1', files: ['face/basic/eye/1.png'] },
		{ label: '2', files: ['face/basic/eye/2.png'] },
		{ label: '3', files: ['face/basic/eye/3.png'] },
		{ label: '윙크1', files: ['face/basic/eye/윙크1.png'] },
		{ label: '윙크2', files: ['face/basic/eye/윙크2.png'] }
	];
	
	// 눈 색상 (face/basic/eye_color 폴더에서 직접 로드)
	state.eyeColorOptions = [
		{ label: 'blue', files: ['face/basic/eye_color/blue.png'] },
		{ label: 'red', files: ['face/basic/eye_color/red.png'] },
		{ label: 'yellow', files: ['face/basic/eye_color/yellow.png'] }
	];
	
	// 입 (face/basic/mouth 폴더에서 직접 로드)
	state.mouthOptions = [
		{ label: '기본입', files: ['face/basic/mouth/기본입.png'] },
		{ label: '웃는입', files: ['face/basic/mouth/웃는입.png'] },
		{ label: '웃는입2', files: ['face/basic/mouth/웃는입2.png'] },
		{ label: '소심한입', files: ['face/basic/mouth/소심한입.png'] },
		{ label: '화난입', files: ['face/basic/mouth/화난입.png'] }
	];
}

function populateSelectors(){
	// 머리 그리드 (lazy loading 적용)
	const hairGrid = document.getElementById('hairGrid');
	const hairOpts = (state.hairOptions || []);
	hairGrid.innerHTML = hairOpts.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 옷 그리드 (lazy loading 적용)
	const clothesGrid = document.getElementById('clothesGrid');
	clothesGrid.innerHTML = state.clothesOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 액세서리 그리드 (lazy loading 적용)
	const accessoryGrid = document.getElementById('accessoryGrid');
	accessoryGrid.innerHTML = `
		<div class="thumb" data-index="-1">
			<div class="no-accessory">❌</div>
			<span>없음</span>
		</div>
	` + state.accessoryOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 모자 그리드 (lazy loading 적용)
	const hatGrid = document.getElementById('hatGrid');
	hatGrid.innerHTML = `
		<div class="thumb" data-index="-1">
			<div class="no-hat">❌</div>
			<span>없음</span>
		</div>
	` + state.hatOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 눈 타입 그리드 (lazy loading 적용)
	const eyeGrid = document.getElementById('eyeGrid');
	eyeGrid.innerHTML = state.eyeOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 눈 색상 그리드 (lazy loading 적용)
	const eyeColorGrid = document.getElementById('eyeColorGrid');
	eyeColorGrid.innerHTML = state.eyeColorOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 입 그리드 (lazy loading 적용)
	const mouthGrid = document.getElementById('mouthGrid');
	mouthGrid.innerHTML = state.mouthOptions.map((o,i)=>`
		<div class="thumb" data-index="${i}">
			<img src="${rel(o.files[0])}" alt="${o.label}" loading="lazy" decoding="async" />
			<span>${o.label}</span>
		</div>
	`).join('');
	
	// 탭 네비게이션 기능 추가
	setupTabNavigation();
	
	// 이벤트 리스너 (모바일 터치 최적화)
	const addTouchEvents = (grid, callback) => {
		let touchStartTime = 0;
		
		grid.addEventListener('touchstart', (e) => {
			touchStartTime = Date.now();
		}, { passive: true });
		
		grid.addEventListener('touchend', (e) => {
			const touchDuration = Date.now() - touchStartTime;
			if (touchDuration < 500) { // 짧은 터치만 처리
				const thumb = e.target.closest('.thumb');
				if(thumb){
					e.preventDefault();
					callback(thumb);
				}
			}
		});
		
		grid.addEventListener('click', (e)=>{
			const thumb = e.target.closest('.thumb');
			if(thumb){
				callback(thumb);
			}
		});
	};
	
	addTouchEvents(hairGrid, (thumb) => {
		state.selectedHair = Number(thumb.dataset.index);
		updateSelection('hair');
		debouncedRender();
	});
	
	addTouchEvents(clothesGrid, (thumb) => {
		state.selectedClothes = Number(thumb.dataset.index);
		
		// 베이쁘(red) 옷이 선택된 경우 모자 벗기기
		if (state.clothesOptions && state.clothesOptions[state.selectedClothes] && 
			state.clothesOptions[state.selectedClothes].files[0].includes('베이쁘(red)')) {
			state.selectedHat = -1; // 모자 벗기기
			updateSelection('hat');
		}
		
		updateSelection('clothes');
		debouncedRender();
	});
	
	addTouchEvents(accessoryGrid, (thumb) => {
		const clickedIndex = Number(thumb.dataset.index);
		state.selectedAccessory = clickedIndex; // 선택된 인덱스로 설정 (-1이면 벗기기)
		updateSelection('accessory');
		debouncedRender();
	});
	
	addTouchEvents(hatGrid, (thumb) => {
		const clickedIndex = Number(thumb.dataset.index);
		state.selectedHat = clickedIndex; // 선택된 인덱스로 설정 (-1이면 벗기기)
		
		// 모자가 선택된 경우 베이쁘(red) 옷이면 다른 옷으로 변경
		if (clickedIndex !== -1 && state.clothesOptions && state.clothesOptions[state.selectedClothes] && 
			state.clothesOptions[state.selectedClothes].files[0].includes('베이쁘(red)')) {
			state.selectedClothes = 0; // 첫 번째 옷으로 변경
			updateSelection('clothes');
		}
		updateSelection('hat');
		debouncedRender();
	});
	
	// 눈 타입 이벤트 리스너
	addTouchEvents(eyeGrid, (thumb) => {
		state.selectedEye = Number(thumb.dataset.index);
		updateSelection('eye');
		debouncedRender();
	});
	
	// 눈 색상 이벤트 리스너
	addTouchEvents(eyeColorGrid, (thumb) => {
		state.selectedEyeColor = Number(thumb.dataset.index);
		updateSelection('eyeColor');
		debouncedRender();
	});
	
	// 입 이벤트 리스너
	addTouchEvents(mouthGrid, (thumb) => {
		state.selectedMouth = Number(thumb.dataset.index);
		updateSelection('mouth');
		debouncedRender();
	});
	
	state.selectedHair = 0; state.selectedClothes = 0; state.selectedAccessory = -1; state.selectedHat = -1;
	state.selectedEye = 0; state.selectedEyeColor = 0; state.selectedMouth = 0;
	updateSelection('hair'); updateSelection('clothes'); updateSelection('accessory'); updateSelection('hat');
	updateSelection('eye'); updateSelection('eyeColor'); updateSelection('mouth');
}

function updateSelection(type){
	const grids = {
		hair: document.getElementById('hairGrid'),
		clothes: document.getElementById('clothesGrid'),
		accessory: document.getElementById('accessoryGrid'),
		hat: document.getElementById('hatGrid'),
		eye: document.getElementById('eyeGrid'),
		eyeColor: document.getElementById('eyeColorGrid'),
		mouth: document.getElementById('mouthGrid')
	};
	const selected = {
		hair: state.selectedHair,
		clothes: state.selectedClothes,
		accessory: state.selectedAccessory,
		hat: state.selectedHat,
		eye: state.selectedEye,
		eyeColor: state.selectedEyeColor,
		mouth: state.selectedMouth
	};
	
	const grid = grids[type];
	const thumbs = grid.querySelectorAll('.thumb');
	thumbs.forEach((thumb, i) => {
		thumb.classList.toggle('selected', i === selected[type] && selected[type] >= 0);
	});
}

async function loadImage(src){
    // 캐시에서 먼저 확인 (즉시 반환)
    if (state.imageCache.has(src)) {
        return Promise.resolve(state.imageCache.get(src));
    }
    
    return new Promise((res,rej)=>{ 
        const img=new Image(); 
        img.onload=()=>{
            state.imageCache.set(src, img);
            res(img);
        }; 
        img.onerror=rej; 
        img.src=src; 
    });
}

function drawCover(ctx, img, cw, ch){
    const ir = img.width / img.height;
    const cr = cw / ch;
    let w, h, x, y;
    if (ir > cr) { // image wider
        h = ch; w = h * ir; x = (cw - w) / 2; y = 0;
    } else {
        w = cw; h = w / ir; x = 0; y = (ch - h) / 2;
    }
    ctx.drawImage(img, x, y, w, h);
}

function drawContain(ctx, img, cw, ch, maxRatio=1){
    const ir = img.width / img.height;
    let w = Math.min(cw * maxRatio, ch * maxRatio * ir);
    let h = w / ir;
    if (h > ch * maxRatio) { h = ch * maxRatio; w = h * ir; }
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    ctx.drawImage(img, x, y, w, h);
}

async function render(){
	const canvas = document.getElementById('canvas');
	const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    
    // 컨텍스트 완전 초기화 (스케일 리셋!)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    // 전체 캔버스 클리어
    ctx.clearRect(0, 0, w, h);
    
    // 기본 배경은 투명 대신 흰색
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // 1) background.png (맨 뒤) - 확대
    try { 
        const img = await loadImage(ASSETS + '/background.png');
        // 1.2배 확대
        const scaledW = w * 1.2;
        const scaledH = h * 1.2;
        const offsetX = (w - scaledW) / 2;
        const offsetY = (h - scaledH) / 2;
        
        const ir = img.width / img.height;
        const cr = scaledW / scaledH;
        let iw, ih, ix, iy;
        if (ir > cr) {
            ih = scaledH; iw = ih * ir; ix = offsetX + (scaledW - iw) / 2; iy = offsetY;
        } else {
            iw = scaledW; ih = iw / ir; ix = offsetX; iy = offsetY + (scaledH - ih) / 2;
        }
        ctx.drawImage(img, ix, iy, iw, ih);
    } catch(e){ 
        ctx.fillStyle='#d1fae5'; 
        ctx.fillRect(0, 0, w, h);
    }

	// 2) frame 및 캐릭터: 프레임 내부에 파츠를 그린 뒤 프레임을 덮어씌움
    try { 
        const frame = await loadImage(ASSETS + '/frame.png');
        if (!frame) throw new Error('프레임 로드 실패');
        
        const targetH = h * FRAME_HEIGHT_RATIO; 
        const targetW = targetH * (frame.width / frame.height);
        let x = (w - targetW) / 2; 
        let y = (h - targetH) / 2;
        x += w * FRAME_OFFSET_RATIO_X;
        y += h * FRAME_OFFSET_RATIO_Y;
        
        // 파츠 합성 - 프레임 내부 사진 영역에 정중앙 배치
        try {
            const layers = ['face/basic/skin_color/skin_color.png'];
            
            // 2. 눈 흰자
            if (state.eyeOptions?.[state.selectedEye]) {
                const eyeName = state.eyeOptions[state.selectedEye].label;
                layers.push(eyeName.includes('윙크') ? 
                    'face/basic/sclera/윙크_sclera.png' : 
                    'face/basic/sclera/normal_sclera.png');
            }
            
            // 3. 눈 색상
            if (state.eyeColorOptions?.[state.selectedEyeColor] && state.eyeOptions?.[state.selectedEye]) {
                const eyeName = state.eyeOptions[state.selectedEye].label;
                const colorName = state.eyeColorOptions[state.selectedEyeColor].label;
                layers.push(eyeName.includes('윙크') ? 
                    `face/basic/eye_color/${colorName}_윙크.png` : 
                    `face/basic/eye_color/${colorName}.png`);
            }
            
            // 4. 입
            if (state.mouthOptions?.[state.selectedMouth]) {
                layers.push(state.mouthOptions[state.selectedMouth].files[0]);
            }
            
            // 5. 머리
            if (state.hairOptions?.[state.selectedHair]) {
                let hairFiles = state.hairOptions[state.selectedHair].files;
                
                console.log('=== 머리 처리 시작 ===');
                console.log('선택된 머리 인덱스:', state.selectedHair);
                console.log('선택된 모자 인덱스:', state.selectedHat);
                console.log('선택된 옷 인덱스:', state.selectedClothes);
                
                // 베이쁘(red) 옷이 선택된 경우 머리를 bappe(red) 폴더의 파일로 변경
                if (state.clothesOptions && state.clothesOptions[state.selectedClothes] && 
                    state.clothesOptions[state.selectedClothes].files[0].includes('베이쁘(red)')) {
                    const hairName = hairFiles[0].split('/').pop().replace(/\.(png|PNG)$/i, '');
                    const beautyRedPath = `hair/bappe(red)/${hairName}.png`;
                    hairFiles = [beautyRedPath];
                    console.log('✅ bappe(red)');
                }
                // 모자 착용 시 머리 변경 (베이쁘 아닐 때만)
                else if (state.selectedHat >= 0 && state.hatOptions?.[state.selectedHat]) {
                    const hairName = hairFiles[0].split('/').pop().replace(/\.(png|PNG)$/i, '');
                    const hatLabel = state.hatOptions[state.selectedHat].label;
                    const hatFilePath = state.hatOptions[state.selectedHat].files[0];
                    
                    console.log('🎩 [RENDER] 모자 정보:', {
                        label: hatLabel,
                        filePath: hatFilePath
                    });
                    
                    // 한글 정규화 문제 회피: 키워드로 구분
                    const normalized = hatFilePath.normalize('NFC');
                    const hasIce = normalized.includes('아이스') || normalized.includes('ice');
                    const hasBeanie = normalized.includes('비니') || normalized.includes('beanie');
                    const hasBeret = normalized.includes('베레모') || normalized.includes('beret');
                    
                    console.log('🔍 비교 결과:', { hasIce, hasBeanie, hasBeret, normalized });
                    
                    if (hasBeret) {
                        // 베레모
                        hairFiles = [`hair/beret/${hairName}.png`];
                        console.log('✅ beret 적용! 경로:', hairFiles[0]);
                    } else if (hasIce && hasBeanie) {
                        // 아이스비니
                        hairFiles = [`hair/ice_beanie/${hairName}.png`];
                        console.log('✅ ice_beanie 적용! 경로:', hairFiles[0]);
                    } else if (hasBeanie) {
                        // 일반 비니 (고양이비니, 블렉비니 등)
                        hairFiles = [`hair/normal_beanie/${hairName}.png`];
                        console.log('✅ normal_beanie 적용! 경로:', hairFiles[0]);
                    } else {
                        console.log('ℹ️ 다른 모자 (변경 없음)');
                    }
                }
                
                layers.push(...hairFiles);
            }
            
            // 6. 눈 모양
            if (state.eyeOptions?.[state.selectedEye]) {
                layers.push(state.eyeOptions[state.selectedEye].files[0]);
            }
            
            // 7. 옷
            if (state.clothesOptions?.[state.selectedClothes]) {
                layers.push(...state.clothesOptions[state.selectedClothes].files);
            }
            
            // 8. 모자
            if (state.hatOptions?.[state.selectedHat] && state.selectedHat >= 0) {
                layers.push(...state.hatOptions[state.selectedHat].files);
            }
            
            // 9. 베이스 (머리에 따라 자동 선택)
            const hairName = state.hairOptions?.[state.selectedHair]?.label;
            const baseMap = {
                '고양이머리': 'face/basic/hair_base/고양이머리_base.png',
                '고양이머리(긴)': 'face/basic/hair_base/고양이머리_base.png',
                '로제(yellow)': 'face/basic/hair_base/로제_base.png',
                '버섯머리': 'face/basic/hair_base/버섯머리_base.png',
                '아이키': 'face/basic/hair_base/아이키_base.png',
                '양갈래(black)': 'face/basic/hair_base/양갈래_base.png',
                '양갈래': 'face/basic/hair_base/양갈래_base.png',
                'special': 'face/basic/hair_base/special_base.png'
            };
            layers.push(baseMap[hairName] || 'face/basic/normal_base/기본_base.png');
            
            // 10. 액세서리 (가장 위)
            if (state.accessoryOptions?.[state.selectedAccessory] && state.selectedAccessory >= 0) {
                layers.push(...state.accessoryOptions[state.selectedAccessory].files);
            }
            // 내부 영역 계산
            const innerX = x + targetW * PHOTO_INSET.left;
            const innerY = y + targetH * PHOTO_INSET.top;
            const innerW = targetW * (1 - PHOTO_INSET.left - PHOTO_INSET.right);
            const innerH = targetH * (1 - PHOTO_INSET.top - PHOTO_INSET.bottom);
            
            // 모든 이미지를 캐시에서 로드 후 그리기
            for (const fp of layers) {
                try {
                    const img = await loadImage(rel(fp));
                    if (!img) continue;
                    // 프레임 내부를 꽉 채우도록 cover 스케일로 그림
                    const ir = img.width / img.height;
                    const cr = innerW / innerH;
                    let dw, dh, dx, dy;
                    if (ir > cr) {
                        dh = innerH * CHARACTER_SCALE; 
                        dw = dh * ir; 
                        dx = innerX + (innerW - dw) / 2; 
                        dy = innerY + (innerH - dh) / 2;
                    } else {
                        dw = innerW * CHARACTER_SCALE; 
                        dh = dw / ir; 
                        dx = innerX + (innerW - dw) / 2; 
                        dy = innerY + (innerH - dh) / 2;
                    }
                    ctx.drawImage(img, dx, dy, dw, dh);
                } catch(e) { 
                    // 이미지 로드 실패 무시
                }
            }
            
            // 프레임을 최상단에 덮어 씌움
            ctx.drawImage(frame, x, y, targetW, targetH);
        } catch(e) {
            // 파츠 렌더링 실패 무시
        }
    } catch(e){ 
        console.error('프레임 렌더링 실패:', e);
        // 실패시 테두리 표시
        ctx.strokeStyle='#ff0000'; 
        ctx.lineWidth=4; 
        ctx.strokeRect(w*0.1, h*0.1, w*0.8, h*0.8);
    }
}

// 필수 이미지만 즉시 로드 (초기 렌더링에 필요한 것만)
async function preloadEssentialImages() {
    const essentialPaths = new Set();
    
    // UI 이미지 (필수)
    essentialPaths.add('mell_studio_asset/background.png');
    essentialPaths.add('mell_studio_asset/frame.png');
    
    // 얼굴 베이스 (필수)
    if (state.faceStack) {
        state.faceStack.forEach(path => essentialPaths.add(rel(path)));
    }
    
    // 현재 선택된 파츠만 (초기값)
    if (state.hairOptions?.[0]) {
        state.hairOptions[0].files.forEach(path => essentialPaths.add(rel(path)));
    }
    if (state.clothesOptions?.[0]) {
        state.clothesOptions[0].files.forEach(path => essentialPaths.add(rel(path)));
    }
    if (state.eyeOptions?.[0]) {
        state.eyeOptions[0].files.forEach(path => essentialPaths.add(rel(path)));
    }
    if (state.eyeColorOptions?.[0]) {
        state.eyeColorOptions[0].files.forEach(path => essentialPaths.add(rel(path)));
    }
    if (state.mouthOptions?.[0]) {
        state.mouthOptions[0].files.forEach(path => essentialPaths.add(rel(path)));
    }
    
    console.log(`필수 이미지 로드 중: ${essentialPaths.size}개`);
    
    // 필수 이미지만 빠르게 로드 (병렬, 에러 무시)
    await Promise.all(
        Array.from(essentialPaths).map(async (path) => {
            try {
                await loadImage(path);
            } catch (e) {
                // 에러 무시
            }
        })
    );
    
    console.log('필수 이미지 로드 완료');
}

// 나머지 이미지를 백그라운드에서 천천히 로드
async function preloadRemainingImages() {
    const allPaths = new Set();
    
    // 모든 옵션 이미지
    state.hairOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.clothesOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.accessoryOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.hatOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.eyeOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.eyeColorOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    state.mouthOptions.forEach(option => {
        option.files.forEach(path => allPaths.add(rel(path)));
    });
    
    console.log(`백그라운드 이미지 로드 시작: ${allPaths.size}개`);
    
    // 천천히 로드 (10개씩 배치로)
    const pathsArray = Array.from(allPaths);
    const batchSize = 10;
    
    for (let i = 0; i < pathsArray.length; i += batchSize) {
        const batch = pathsArray.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async (path) => {
                try {
                    await loadImage(path);
                } catch (e) {
                    // 에러 무시
                }
            })
        );
        // 다음 배치까지 짧은 대기 (브라우저가 다른 작업 처리하도록)
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log('모든 이미지 로드 완료');
}

// 탭 네비게이션 설정
function setupTabNavigation() {
	const tabBtns = document.querySelectorAll('.tab-btn');
	const tabContents = document.querySelectorAll('.tab-content');
	
	tabBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			const tabName = btn.dataset.tab;
			
			// 모든 탭 비활성화
			tabBtns.forEach(b => b.classList.remove('active'));
			tabContents.forEach(c => c.classList.remove('active'));
			
			// 선택된 탭 활성화
			btn.classList.add('active');
			document.getElementById(`tab-${tabName}`).classList.add('active');
		});
	});
}

function bindUI(){
	document.getElementById('btnRandom').addEventListener('click', ()=>{
		state.selectedHair = Math.floor(Math.random()*state.hairOptions.length);
		
		// 베이쁘(red) 옷을 우선적으로 선택하도록 가중치 적용
		const beautyRedIndex = state.clothesOptions.findIndex(option => 
			option.files[0].includes('베이쁘(red)')
		);
		
		// 50% 확률로 베이쁘(red) 옷 선택, 50% 확률로 다른 옷 선택
		if (Math.random() < 0.5 && beautyRedIndex !== -1) {
			state.selectedClothes = beautyRedIndex;
			state.selectedHat = -1; // 베이쁘(red) 옷일 때는 모자 벗기기
		} else {
			state.selectedClothes = Math.floor(Math.random()*state.clothesOptions.length);
			
			// 선택된 옷이 베이쁘(red)가 아닌 경우에만 모자 선택
			const selectedClothesFile = state.clothesOptions[state.selectedClothes].files[0];
			if (!selectedClothesFile.includes('베이쁘(red)')) {
				// 베이쁘(red) 옷이 아닌 경우에만 모자는 30% 확률로 선택
				if (Math.random() < 0.3) {
					state.selectedHat = Math.floor(Math.random()*state.hatOptions.length);
				} else {
					state.selectedHat = -1; // 모자 벗기기
				}
			} else {
				state.selectedHat = -1; // 베이쁘(red) 옷이면 모자 벗기기
			}
		}
		
		// 악세서리도 랜덤 선택 (모자처럼)
		if (Math.random() < 0.4) { // 40% 확률로 악세서리 선택
			state.selectedAccessory = Math.floor(Math.random()*state.accessoryOptions.length);
		} else {
			state.selectedAccessory = -1; // 악세서리 없음
		}
		
		// 눈 타입 랜덤 선택
		state.selectedEye = Math.floor(Math.random()*state.eyeOptions.length);
		
		// 눈 색상 랜덤 선택
		state.selectedEyeColor = Math.floor(Math.random()*state.eyeColorOptions.length);
		
		// 입 랜덤 선택
		state.selectedMouth = Math.floor(Math.random()*state.mouthOptions.length);
		
		// 디버깅: 선택된 옷 확인
		console.log('랜덤 선택된 옷 인덱스:', state.selectedClothes);
		console.log('선택된 옷 파일:', state.clothesOptions[state.selectedClothes]?.files[0]);
		console.log('선택된 모자 인덱스:', state.selectedHat);
		console.log('선택된 악세서리 인덱스:', state.selectedAccessory);
		console.log('선택된 눈 타입 인덱스:', state.selectedEye);
		console.log('선택된 눈 색상 인덱스:', state.selectedEyeColor);
		console.log('선택된 입 인덱스:', state.selectedMouth);
		
		updateSelection('hat');
		updateSelection('accessory');
		updateSelection('eye');
		updateSelection('eyeColor');
		updateSelection('mouth');
		document.getElementById('hair').value = String(state.selectedHair);
		document.getElementById('clothes').value = String(state.selectedClothes);
		debouncedRender();
	});
	document.getElementById('btnSave').addEventListener('click', ()=>{
		const link = document.createElement('a');
		link.download = 'mell.png';
		link.href = document.getElementById('canvas').toDataURL('image/png');
		link.click();
	});
}

(async function init(){
    // 로딩 화면 표시
    const loading = document.getElementById('loading');
    
    // 캔버스를 뷰포트에 맞춤 (모바일 최적화)
    const canvas = document.getElementById('canvas');
    function resize(){ 
        const previewSection = document.querySelector('.preview-section');
        if (!previewSection) return;
        
        const rect = previewSection.getBoundingClientRect();
        
        // 실제 디바이스 픽셀 비율 고려 (Retina)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // CSS 크기 설정
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        // 캔버스 컨텍스트 스케일 조정
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); // 초기화
        ctx.scale(dpr, dpr);
        
        render(); // 즉시 렌더링
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => {
        setTimeout(resize, 100); // 회전 후 잠시 대기
    });
    setTimeout(() => resize(), 100); // 초기 로드 시 약간 대기

    // 파츠 선택기 로드
    try {
        await loadManifest();
        pickFaceStack();
        buildOptions();
        populateSelectors();
        document.getElementById('btnRandom').onclick = ()=>{
            state.selectedHair = Math.floor(Math.random()*state.hairOptions.length);
            state.selectedClothes = Math.floor(Math.random()*state.clothesOptions.length);
            state.selectedAccessory = Math.floor(Math.random()*state.accessoryOptions.length);
            // 모자는 50% 확률로 착용하거나 착용하지 않음
            state.selectedHat = Math.random() < 0.5 ? Math.floor(Math.random()*state.hatOptions.length) : -1;
            state.selectedEye = Math.floor(Math.random()*state.eyeOptions.length);
            state.selectedEyeColor = Math.floor(Math.random()*state.eyeColorOptions.length);
            state.selectedMouth = Math.floor(Math.random()*state.mouthOptions.length);
            updateSelection('hair'); updateSelection('clothes'); updateSelection('accessory'); updateSelection('hat');
            updateSelection('eye'); updateSelection('eyeColor'); updateSelection('mouth');
            debouncedRender();
        };
        document.getElementById('btnSave').onclick = ()=>{
            // 현재 캔버스를 그대로 저장 (간단한 방법)
            const link = document.createElement('a');
            link.download = 'mell-character.png';
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 피드백
            const saveBtn = document.getElementById('btnSave');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<span class="btn-icon">✅</span><span>저장!</span>';
            setTimeout(() => {
                saveBtn.innerHTML = originalText;
            }, 1500);
        };
        
        // 고품질 저장 (프레임만 저장) - 나중에 사용할 수도 있음
        document.getElementById('btnSaveFrame') && (document.getElementById('btnSaveFrame').onclick = async ()=>{
            const saveBtn = document.getElementById('btnSaveFrame');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '⏳ 저장 중...';
            saveBtn.disabled = true;
            
            try {
                const frame = await loadImage(ASSETS + '/frame.png');
                const dpr = window.devicePixelRatio || 1;
                const actualWidth = canvas.width / dpr;
                const actualHeight = canvas.height / dpr;
                
                const targetH = actualHeight * FRAME_HEIGHT_RATIO; 
                const targetW = targetH * (frame.width / frame.height);
                let x = (actualWidth - targetW) / 2; 
                let y = (actualHeight - targetH) / 2;
                x += actualWidth * FRAME_OFFSET_RATIO_X;
                y += actualHeight * FRAME_OFFSET_RATIO_Y;
            
            // 임시 캔버스에 프레임 전체 영역 그리기
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetW;
            tempCanvas.height = targetH;
            const tempCtx = tempCanvas.getContext('2d');
            
            // 캔버스 배경을 하얀색으로 설정
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, targetW, targetH);
            
            // 1) 하얀색 배경 (이미 위에서 설정했지만 확실히 하기 위해)
            tempCtx.fillStyle='#ffffff'; 
            tempCtx.fillRect(0,0,targetW,targetH);
            
            // 2) background.png 추가
            try { 
                const bgImg = await loadImage(ASSETS + '/background.png'); 
                drawCover(tempCtx, bgImg, targetW, targetH); 
            } catch(e){ 
                // background.png가 없으면 하얀색 배경 유지
            }
            
            // 3) 캐릭터 (프레임 내부 사진 영역에)
            const innerX = targetW * PHOTO_INSET.left;
            const innerY = targetH * PHOTO_INSET.top;
            const innerW = targetW * (1 - PHOTO_INSET.left - PHOTO_INSET.right);
            const innerH = targetH * (1 - PHOTO_INSET.top - PHOTO_INSET.bottom);
            
            const layers = [];
            
            // 1. 피부색 (고정)
            layers.push('face/basic/skin_color/skin_color.png');
            
            // 2. 눈 흰자 (눈 종류에 따라 자동 선택)
            if (state.eyeOptions && state.eyeOptions[state.selectedEye]) {
                const eyeName = state.eyeOptions[state.selectedEye].label;
                // 윙크 눈인 경우 윙크_sclera.png 사용
                if (eyeName.includes('윙크')) {
                    layers.push('face/basic/sclera/윙크_sclera.png');
                } else {
                    // 일반 눈인 경우 normal_sclera.png 사용
                    layers.push('face/basic/sclera/normal_sclera.png');
                }
            }
            
            // 3. 눈 색상 (eye_color) - 눈 모양에 따라 자동 선택
            if (state.eyeColorOptions && state.eyeColorOptions[state.selectedEyeColor] && 
                state.eyeOptions && state.eyeOptions[state.selectedEye]) {
                const eyeName = state.eyeOptions[state.selectedEye].label;
                const colorName = state.eyeColorOptions[state.selectedEyeColor].label;
                
                let colorFile;
                // 윙크 눈인 경우 윙크 버전의 색상 사용
                if (eyeName.includes('윙크')) {
                    colorFile = `face/basic/eye_color/${colorName}_윙크.png`;
                } else {
                    // 일반 눈인 경우 기본 색상 사용
                    colorFile = `face/basic/eye_color/${colorName}.png`;
                }
                layers.push(colorFile);
            }
            
            // 4. 입 (mouth)
            if (state.mouthOptions && state.mouthOptions[state.selectedMouth]) {
                layers.push(state.mouthOptions[state.selectedMouth].files[0]);
            }
            
            // 5. 머리 추가 (베이쁘(red) 옷 선택시 베이쁘(red) 폴더의 파일로 변경, 모자 착용시에만 ice_beanie 폴더의 파일로 변경)
            if (state.hairOptions && state.hairOptions[state.selectedHair]) {
                let hairFiles = state.hairOptions[state.selectedHair].files;
                
                // 베이쁘(red) 옷이 선택된 경우 머리를 bappe(red) 폴더의 파일로 변경
                if (state.clothesOptions && state.clothesOptions[state.selectedClothes] && 
                    state.clothesOptions[state.selectedClothes].files[0].includes('베이쁘(red)')) {
                    const hairName = hairFiles[0].split('/').pop().replace(/\.(png|PNG)$/i, '');
                    const beautyRedPath = `hair/bappe(red)/${hairName}.png`;
                    hairFiles = [beautyRedPath];
                }
                // 모자 착용 시 머리 변경 (베이쁘 아닐 때만)
                else if (state.selectedHat >= 0 && state.hatOptions?.[state.selectedHat]) {
                    const hairName = hairFiles[0].split('/').pop().replace(/\.(png|PNG)$/i, '');
                    const hatFilePath = state.hatOptions[state.selectedHat].files[0];
                    
                    console.log('🎩 [SAVE] 모자 경로:', hatFilePath);
                    
                    // 한글 정규화 문제 회피: 키워드로 구분
                    const normalized = hatFilePath.normalize('NFC');
                    const hasIce = normalized.includes('아이스') || normalized.includes('ice');
                    const hasBeanie = normalized.includes('비니') || normalized.includes('beanie');
                    const hasBeret = normalized.includes('베레모') || normalized.includes('beret');
                    
                    if (hasBeret) {
                        // 베레모
                        hairFiles = [`hair/beret/${hairName}.png`];
                        console.log('✅ [SAVE] beret 적용!');
                    } else if (hasIce && hasBeanie) {
                        // 아이스비니
                        hairFiles = [`hair/ice_beanie/${hairName}.png`];
                        console.log('✅ [SAVE] ice_beanie 적용!');
                    } else if (hasBeanie) {
                        // 일반 비니 (고양이비니, 블렉비니 등)
                        hairFiles = [`hair/normal_beanie/${hairName}.png`];
                        console.log('✅ [SAVE] normal_beanie 적용!');
                    }
                }
                
                layers.push(...hairFiles);
            }
            
            // 6. 눈 모양 (eye) - 머리 위에
            if (state.eyeOptions && state.eyeOptions[state.selectedEye]) {
                layers.push(state.eyeOptions[state.selectedEye].files[0]);
            }
            
            // 7. 옷 추가
            if (state.clothesOptions && state.clothesOptions[state.selectedClothes]) {
                layers.push(...state.clothesOptions[state.selectedClothes].files);
            }
            
            // 8. 모자 추가 (선택된 경우에만)
            if (state.hatOptions && state.hatOptions[state.selectedHat] && state.selectedHat >= 0) {
                layers.push(...state.hatOptions[state.selectedHat].files);
            }
            
            // 9. 베이스 (머리에 따라 자동 선택) - 액세서리 전 모든 레이어 위에
            let saveBaseFile = 'face/basic/normal_base/기본_base.png'; // 기본 베이스
            
            if (state.hairOptions && state.hairOptions[state.selectedHair]) {
                const hairName = state.hairOptions[state.selectedHair].label;
                
                // 특별한 머리들에 대한 베이스 매핑
                if (hairName === '고양이머리' || hairName === '고양이머리(긴)') {
                    saveBaseFile = 'face/basic/hair_base/고양이머리_base.png';
                } else if (hairName === '로제(yellow)') {
                    saveBaseFile = 'face/basic/hair_base/로제_base.png';
                } else if (hairName === '버섯머리') {
                    saveBaseFile = 'face/basic/hair_base/버섯머리_base.png';
                } else if (hairName === '아이키') {
                    saveBaseFile = 'face/basic/hair_base/아이키_base.png';
                } else if (hairName === '양갈래(black)' || hairName === '양갈래') {
                    saveBaseFile = 'face/basic/hair_base/양갈래_base.png';
                } else if (hairName === 'special') {
                    saveBaseFile = 'face/basic/hair_base/special_base.png';
                }
            }
            
            layers.push(saveBaseFile);
            
            // 10. 액세서리를 모든 파츠 위에 추가 (가장 위 레이어) - 선택된 경우에만
            if (state.accessoryOptions && state.accessoryOptions[state.selectedAccessory] && state.selectedAccessory >= 0) {
                layers.push(...state.accessoryOptions[state.selectedAccessory].files);
            }
            
            for (const fp of layers) {
                const url = rel(fp) + '?t=' + Date.now();
                const img = await loadImage(url);
                const ir = img.width / img.height;
                const cr = innerW / innerH;
                let dw, dh, dx, dy;
                if (ir > cr) {
                    dh = innerH * CHARACTER_SCALE; dw = dh * ir; dx = innerX + (innerW - dw) / 2; dy = innerY + (innerH - dh) / 2;
                } else {
                    dw = innerW * CHARACTER_SCALE; dh = dw / ir; dx = innerX + (innerW - dw) / 2; dy = innerY + (innerH - dh) / 2;
                }
                tempCtx.drawImage(img, dx, dy, dw, dh);
            }
            
            // 4) 프레임을 맨 위에
            tempCtx.drawImage(frame, 0, 0, targetW, targetH);
            
            // 최종적으로 하얀색 배경을 다시 한번 덮어씌움 (프레임 투명 부분도 하얗게)
            tempCtx.globalCompositeOperation = 'destination-over';
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, targetW, targetH);
            tempCtx.globalCompositeOperation = 'source-over';
            
                const link = document.createElement('a');
                link.download = 'mell-frame.png';
                link.href = tempCanvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                saveBtn.innerHTML = '✅ 저장 완료!';
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.disabled = false;
                }, 1500);
            } catch (error) {
                console.error('저장 실패:', error);
                saveBtn.innerHTML = '❌ 저장 실패';
                setTimeout(() => {
                    saveBtn.innerHTML = originalText;
                    saveBtn.disabled = false;
                }, 1500);
            }
        });
        
        // 필수 이미지만 먼저 로드
        await preloadEssentialImages();
        
        // 로딩 화면 즉시 숨기기
        loading.classList.add('hidden');
        setTimeout(() => loading.style.display = 'none', 100);
        
        // 나머지 이미지는 백그라운드에서 천천히 로드 (블로킹하지 않음)
        preloadRemainingImages().catch(e => console.log('백그라운드 로드 실패 (무시됨)'));
    } catch (e) {
        console.warn('매니페스트 로드 중 문제:', e);
        loading.classList.add('hidden');
    }
})();




