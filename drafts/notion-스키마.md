# 🗂️ Notion 문제 저작 — DB 스키마 설계 (A2)

> **목적:** 구글 시트 → Notion DB 전환. 선생님이 **유튜브·이미지·오디오를 눈으로 보며** 문제를 만들고,
> 변환 스크립트가 `questions.json` / `course.json` 을 생성 → GitHub Pages 자동 반영.
>
> **게임 사이트(HTML/JS)는 그대로.** 바뀌는 건 "문제 저작 + 변환" 뿐.

---

## 구성: DB 2개

### 1) 📝 문제 DB (Questions)

문제 1개 = 1행(페이지). 속성:

| 속성명 | Notion 타입 | 필수 | 설명 | 예시 |
|--------|-------------|:---:|------|------|
| **id** | 제목(Title) | ✓ | 문제 고유 ID. 조합형 `2A`, 공통형 `4` | `3B` |
| **set** | 숫자(Number) | ✓ | 장소 번호 (같은 set = 한 장소) | `3` |
| **slot** | 선택(Select) | | 조합형 순번. 공통형은 비움 | `A` `B` `C` `D` |
| **category** | 선택(Select) | ✓ | 과목·분류 | `국어` `과학` `추론` `현장관찰` |
| **difficulty** | 선택(Select) | ✓ | 난이도 | `easy` `normal` `hard` |
| **question** | 텍스트(Rich text) | ✓ | 문제 내용 (줄바꿈 가능) | `콘센트에서 나오는…` |
| **answer** | 텍스트(Rich text) | ✓ | 조합형=1글자 / 공통형=정답 전체 | `전` / `42` |
| **combined** | 텍스트(Rich text) | ✓ | 합본 정답. 공통형은 answer와 동일 | `손전등` |
| **hint1** | 텍스트 | | 힌트 1 | |
| **hint2** | 텍스트 | | 힌트 2 | |
| **hint3** | 텍스트 | | 힌트 3 | |
| **미디어유형** | 선택(Select) | | `없음`/`image`/`youtube`/`audio` | `youtube` |
| **미디어URL** | URL | | 이미지·영상·오디오 주소 | `https://youtu.be/…` |

> **여러 미디어가 필요하면?** 지금 게임 스키마는 `media[]` 배열을 지원하지만, 한 문제에 미디어 1개면 충분한 경우가 대부분이라 **속성 1쌍(유형+URL)** 으로 단순화했습니다. 2개 이상 필요하면 `미디어유형2`/`미디어URL2` 처럼 쌍을 늘리면 됩니다.

#### 미디어를 어디 담을까 — 결정: **속성(URL)** 방식 ✅

| 방식 | 장점 | 단점 | 채택 |
|------|------|------|:---:|
| **속성에 URL** | 변환 단순(파싱 X), 안정적 | 편집 시 미리보기 약함 | ✅ |
| 본문에 임베드 | 저작 시 미디어 바로 보임 | 블록 파싱 복잡·깨지기 쉬움 | |

> 절충 팁: 속성엔 URL을 넣되, **편집 미리보기는 페이지 본문에 같은 유튜브/이미지를 붙여** 눈으로 확인하세요. 변환은 속성만 읽으므로 본문은 자유롭게 써도 됩니다.

---

### 2) 📍 코스 DB (Course / Places)

장소 1개 = 1행. set 단위 정보(문제 DB에 없는 것)만.

| 속성명 | Notion 타입 | 필수 | 설명 | 예시 |
|--------|-------------|:---:|------|------|
| **set** | 제목(Title) | ✓ | 장소 번호 | `3` |
| **placeName** | 텍스트 | ✓ | 장소 이름 | `도서관 입구` |
| **piece** | 텍스트 | ✓ | 이 장소에서 주는 **보물 암호 글자 1개** | `장` |

> `mode`(common/combo)와 `qids`는 **문제 DB에서 자동 계산**됩니다 (set별 문제 개수로). 코스 DB엔 안 넣어도 돼요.

---

### 3) ⚙️ 설정 — 최종 조합(finale) & 메타

코스 DB에 **set = `0`(또는 `finale`) 인 특수 행** 하나를 두고 거기에 최종 정보를 담거나, 별도 설정 DB/페이지로 관리:

| 키 | 값 예시 | → course.json 매핑 |
|----|---------|---------------------|
| title | `학교 캠핑 탐험대` | `title` |
| subtitle | `QR을 찾아 미션을 해결하고 보물을 찾아라!` | `subtitle` |
| teams | `1조,2조,3조,4조` | `teams[]` (콤마 분리) |
| finale.answer | `운동장큰은행나무` | `finale.answer` |
| finale.title | `마지막 미션 · 보물 암호 조합` | `finale.title` |
| finale.prompt | `미션마다 모은 글자 8개를…` | `finale.prompt` |
| finale.reveal | `보물은 그곳에 숨겨져 있어요…` | `finale.reveal` |

> 가장 단순한 방법: 코스 DB에 `set=0` 행을 만들고 placeName 칸에 위 값들을 모아두기보다, **별도 "설정" Notion 페이지**에 표로 정리하고 변환 스크립트가 그 페이지를 읽게 하는 게 깔끔합니다. (스크립트에서 SETTINGS_PAGE_ID 지정)

---

## 변환 결과 매핑 요약

```
[문제 DB]  → questions.json
  각 행 → { id, set, slot, category, difficulty, question,
            media: [{type:미디어유형, url:미디어URL}],   // 유형이 '없음'/빈값이면 media: []
            hints: [hint1, hint2, hint3].filter(존재),
            answer, combined }

[코스 DB]  → course.json.missions
  set별 그룹 → { set, placeName, piece,
                 qids: 해당 set 문제 id들(slot 순 정렬),
                 mode: qids.length===1 ? 'common' : 'combo' }

[설정]     → course.json { title, subtitle, teams, finale }
```

---

## 다음: 실제 Notion DB 만들기 (사용자 확인 필요)

자동으로 만들려면 **DB를 붙일 부모 페이지**가 필요합니다. 정해주시면:
1. Notion 통합(integration) 토큰을 해당 페이지에 연결(공유)
2. 변환 스크립트(`tools/notion-to-json.mjs`)에 DB ID 3개 넣기
3. 초안(`문제초안-v1.md`) 8미션을 DB에 입력
4. 변환 실행 → `questions.json`/`course.json` 생성 확인

> 부모 페이지를 어디에 둘지(예: 기존 Notion 워크스페이스의 특정 페이지) 알려주시면 그 위치에 DB 생성을 도와드립니다.
