# 멜 스튜디오 UI 커스터마이징 가이드 🎨

이 가이드는 선택창 UI를 직접 디자인하고 수정하는 방법을 안내합니다.

## 📁 주요 파일

- `index.html` - HTML 구조
- `styles.css` - 스타일링
- `app.js` - 동작 로직

---

## 🎨 1. 색상 테마 변경

`styles.css` 파일 상단의 `:root` 변수를 수정하세요:

```css
:root {
	--bg-primary: #1a1a1a;      /* 메인 배경색 */
	--bg-secondary: #2a2a2a;    /* 카드/버튼 배경 */
	--bg-tertiary: #3a3a3a;     /* 호버 상태 */
	--text-primary: #ffffff;    /* 메인 텍스트 */
	--text-secondary: #b0b0b0;  /* 보조 텍스트 */
	--accent: #6366f1;          /* 강조색 (선택됨) */
	--accent-hover: #4f46e5;    /* 강조색 호버 */
	--success: #10b981;         /* 성공 색상 */
	--border: #404040;          /* 테두리 */
	--shadow: rgba(0, 0, 0, 0.3); /* 그림자 */
}
```

### 예시 테마

**핑크 테마:**
```css
:root {
	--bg-primary: #2d1b2e;
	--bg-secondary: #3d2b3e;
	--bg-tertiary: #4d3b4e;
	--text-primary: #ffffff;
	--text-secondary: #d4a5d4;
	--accent: #ff6b9d;
	--accent-hover: #ff4d7d;
	--success: #ff6b9d;
	--border: #664d66;
	--shadow: rgba(255, 107, 157, 0.3);
}
```

**하늘색 테마:**
```css
:root {
	--bg-primary: #0f1419;
	--bg-secondary: #1e2732;
	--bg-tertiary: #2d3748;
	--text-primary: #ffffff;
	--text-secondary: #a0aec0;
	--accent: #38b2f4;
	--accent-hover: #2998d8;
	--success: #4fd1c5;
	--border: #4a5568;
	--shadow: rgba(56, 178, 244, 0.3);
}
```

---

## 🖼️ 2. 탭 아이콘 변경

`index.html`의 탭 네비게이션 부분을 수정:

```html
<div class="tab-navigation">
	<button class="tab-btn active" data-tab="hair">
		<span class="tab-icon">💇</span>  <!-- 여기 이모지 변경 -->
		<span class="tab-label">머리</span>
	</button>
	<!-- ... -->
</div>
```

### 추천 이모지

- 머리: 💇 💈 🧑‍🦰 👱
- 옷: 👕 👔 🧥 👗
- 악세: 👓 💍 ⌚ 📿
- 모자: 🎩 👒 🧢 👑
- 얼굴: 😊 🙂 😀 🤗

### 이미지 아이콘 사용

이모지 대신 이미지를 사용하려면:

```html
<span class="tab-icon">
	<img src="icons/hair.png" alt="머리" style="width: 24px; height: 24px;" />
</span>
```

---

## 📐 3. 레이아웃 조정

### 캔버스 높이 변경

`styles.css`에서:

```css
.preview-section {
	height: 45vh;  /* 40vh ~ 60vh 사이로 조정 */
}
```

### 썸네일 크기 변경

```css
.item-grid {
	grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); /* 80px 변경 */
	gap: 12px; /* 간격 조정 */
}
```

**큰 썸네일 (100px):**
```css
.item-grid {
	grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
	gap: 16px;
}
```

**작은 썸네일 (60px):**
```css
.item-grid {
	grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
	gap: 8px;
}
```

### 탭 높이 변경

```css
.tab-btn {
	padding: 12px 8px; /* 세로, 가로 패딩 */
}

.tab-icon {
	font-size: 24px; /* 아이콘 크기 */
}

.tab-label {
	font-size: 11px; /* 라벨 크기 */
}
```

---

## 🎭 4. 썸네일 스타일 변경

### 둥근 썸네일

```css
.thumb {
	border-radius: 50%; /* 원형 */
	/* 또는 */
	border-radius: 20px; /* 둥근 사각형 */
}
```

### 썸네일 테두리 효과

```css
.thumb {
	border: 3px solid var(--border); /* 두께 변경 */
	box-shadow: 0 4px 8px var(--shadow); /* 그림자 추가 */
}

.thumb.selected {
	border-color: var(--accent);
	border-width: 4px; /* 선택시 더 두껍게 */
	box-shadow: 0 0 20px var(--accent); /* 빛나는 효과 */
}
```

### 썸네일 라벨 스타일

```css
.thumb span {
	background: rgba(0, 0, 0, 0.9); /* 더 불투명하게 */
	font-size: 10px; /* 글자 크기 */
	font-weight: bold; /* 굵게 */
	border-radius: 0 0 12px 12px; /* 하단만 둥글게 */
}
```

---

## 🔘 5. 버튼 스타일 변경

### 랜덤/저장 버튼

```css
.action-btn {
	padding: 16px 24px; /* 크기 */
	border-radius: 12px; /* 둥글기 */
	font-size: 16px; /* 글자 크기 */
}

.action-btn.primary {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* 그라데이션 */
}

.action-btn.secondary {
	background: var(--bg-secondary);
	border: 2px solid var(--accent); /* 테두리 추가 */
}
```

### 버튼 아이콘

`index.html`에서 이모지 변경:

```html
<button id="btnRandom" class="action-btn secondary">
	<span class="btn-icon">🎲</span> <!-- 다른 이모지: 🔀 ⚡ ✨ -->
	<span>랜덤</span>
</button>
<button id="btnSave" class="action-btn primary">
	<span class="btn-icon">💾</span> <!-- 다른 이모지: 📥 ⬇️ 💿 -->
	<span>저장하기</span>
</button>
```

---

## 🌈 6. 애니메이션 효과

### 썸네일 호버 효과

```css
.thumb {
	transition: all 0.3s ease;
}

.thumb:hover {
	transform: translateY(-5px); /* 위로 떠오름 */
	box-shadow: 0 8px 16px var(--shadow);
}

.thumb:active {
	transform: scale(0.95) translateY(-5px);
}
```

### 선택 애니메이션

```css
.thumb.selected {
	animation: pulse 0.5s ease;
}

@keyframes pulse {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(1.05); }
}
```

### 탭 전환 애니메이션

```css
.tab-content {
	animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
	from { opacity: 0; transform: translateY(10px); }
	to { opacity: 1; transform: translateY(0); }
}
```

---

## 🖼️ 7. 배경 이미지 추가

### 전체 배경

```css
body {
	background: url('images/background.jpg') center/cover no-repeat fixed;
}
```

### 선택 영역 배경

```css
.selection-area {
	background: url('images/pattern.png') repeat;
	background-blend-mode: overlay;
}
```

---

## 📱 8. 모바일 최적화

### 작은 화면 조정

```css
@media (max-width: 480px) {
	.item-grid {
		grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
		gap: 8px;
	}
	
	.tab-icon {
		font-size: 20px;
	}
	
	.tab-label {
		font-size: 10px;
	}
	
	.action-btn {
		padding: 12px 16px;
		font-size: 14px;
	}
}
```

---

## 🎯 9. 커스텀 폰트 사용

`styles.css` 상단에 추가:

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');

body {
	font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

**다른 폰트 예시:**
- 'Cute Font' - 귀여운 느낌
- 'Black Han Sans' - 강렬한 느낌
- 'Jua' - 부드러운 느낌

---

## 💡 10. 빠른 테마 템플릿

### 복사해서 사용할 수 있는 완성된 테마

#### 🌸 파스텔 핑크 테마
```css
:root {
	--bg-primary: #fff0f6;
	--bg-secondary: #ffe3f0;
	--bg-tertiary: #ffd1e8;
	--text-primary: #2d2d2d;
	--text-secondary: #6d6d6d;
	--accent: #ff6b9d;
	--accent-hover: #ff4d7d;
	--success: #ff85a8;
	--border: #ffb3cc;
	--shadow: rgba(255, 107, 157, 0.2);
}

.preview-section {
	background: linear-gradient(180deg, #ffe3f0 0%, #fff0f6 100%);
}
```

#### 🌙 다크 블루 테마
```css
:root {
	--bg-primary: #0a0e27;
	--bg-secondary: #1a1f38;
	--bg-tertiary: #2a2f48;
	--text-primary: #e2e8f0;
	--text-secondary: #94a3b8;
	--accent: #3b82f6;
	--accent-hover: #2563eb;
	--success: #10b981;
	--border: #334155;
	--shadow: rgba(59, 130, 246, 0.3);
}

.preview-section {
	background: linear-gradient(180deg, #1a1f38 0%, #0a0e27 100%);
}
```

#### 🍊 오렌지 에너제틱 테마
```css
:root {
	--bg-primary: #1a0f0a;
	--bg-secondary: #2a1f1a;
	--bg-tertiary: #3a2f2a;
	--text-primary: #ffffff;
	--text-secondary: #d4a896;
	--accent: #ff8c42;
	--accent-hover: #ff6f1a;
	--success: #ffa94d;
	--border: #664d3a;
	--shadow: rgba(255, 140, 66, 0.3);
}

.preview-section {
	background: linear-gradient(180deg, #2a1f1a 0%, #1a0f0a 100%);
}
```

---

## 🛠️ 실전 예시: 네온 테마 만들기

완전히 새로운 네온 느낌 테마:

```css
/* styles.css에 추가 */
:root {
	--bg-primary: #000000;
	--bg-secondary: #0a0a0a;
	--bg-tertiary: #1a1a1a;
	--text-primary: #00ff88;
	--text-secondary: #00cc66;
	--accent: #00ff88;
	--accent-hover: #00dd77;
	--success: #00ff88;
	--border: #00ff88;
	--shadow: rgba(0, 255, 136, 0.5);
}

.thumb {
	border: 2px solid var(--accent);
	box-shadow: 0 0 10px var(--accent);
	background: #000000;
}

.thumb.selected {
	box-shadow: 0 0 25px var(--accent), inset 0 0 15px var(--accent);
	border-width: 3px;
}

.action-btn.primary {
	background: #000000;
	border: 2px solid var(--accent);
	color: var(--accent);
	box-shadow: 0 0 20px var(--accent);
}

.tab-btn.active {
	color: var(--accent);
	text-shadow: 0 0 10px var(--accent);
}
```

---

## 📋 체크리스트

커스터마이징 후 확인할 사항:

- [ ] 모든 텍스트가 읽기 쉬운가?
- [ ] 선택된 항목이 명확하게 구분되는가?
- [ ] 모바일에서 버튼을 누르기 쉬운가?
- [ ] 다크모드/라이트모드 둘 다 테스트했는가?
- [ ] 썸네일 이미지가 잘 보이는가?

---

## 💾 백업 추천

수정 전에 원본 파일을 백업하세요:

```bash
cp styles.css styles.css.backup
cp index.html index.html.backup
```

---

## 🎨 더 많은 아이디어

1. **그라데이션 배경** - CSS gradient generator 사용
2. **파티클 효과** - particles.js 라이브러리 추가
3. **사운드 효과** - 버튼 클릭 시 소리 추가
4. **햅틱 피드백** - 모바일에서 진동 효과
5. **테마 전환 버튼** - 라이트/다크 토글

궁금한 점이나 특정 스타일을 구현하고 싶으면 언제든 물어보세요! 🚀

