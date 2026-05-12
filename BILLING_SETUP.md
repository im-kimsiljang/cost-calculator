# 토스 빌링 백엔드 셋업 가이드

## 1. Vercel 환경변수 등록

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**

### TOSS_SECRET_KEY
- **Name**: `TOSS_SECRET_KEY`
- **Value (테스트)**: `test_sk_6BYq7GWPVvDBZR4QzMj58NE5vbo1`
- **Value (라이브)**: 토스 콘솔에서 발급 → `live_sk_…`
- **Environments**: Production / Preview / Development 모두 체크

### FIREBASE_SERVICE_ACCOUNT
1. Firebase Console → 프로젝트 (`kimsiljang-1e06d`) → **프로젝트 설정 → 서비스 계정** 탭
2. **새 비공개 키 생성** → JSON 파일 다운로드
3. JSON 파일 내용 전체를 한 줄로 압축(또는 base64 인코딩)
4. Vercel 환경변수로 등록:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: JSON 원본(`{...}`) 또는 base64 문자열
   - **Environments**: Production / Preview / Development 모두

> ⚠️ 절대 git에 커밋 X, 채팅/스크린샷에 공유 X

---

## 2. 로컬 개발 시 테스트

Vercel Functions를 로컬에서 돌리려면:

```bash
npm install -g vercel
vercel dev
```

`.env.local` 파일을 프로젝트 루트에 만들고 (gitignore 처리됨):

```
TOSS_SECRET_KEY=test_sk_6BYq7GWPVvDBZR4QzMj58NE5vbo1
FIREBASE_SERVICE_ACCOUNT={...JSON 한 줄...}
```

`vercel dev`가 자동으로 `.env.local`을 읽고 `http://localhost:3000` 에 띄움. 그 후 `http://localhost:3000/cost-calculator/` 로 접속해 테스트.

> python http.server 로는 백엔드 라우트가 안 떠요. `vercel dev` 써야 `/api/...` 호출 가능.

---

## 3. Firestore 데이터 구조

### `billings/{uid}`
사용자별 빌링키 보관. 카드 인증 1회당 1개.

```json
{
  "uid": "abc123",
  "billingKey": "bil_...",
  "customerKey": "abc123",
  "mId": "tosspayments",
  "method": "카드",
  "authenticatedAt": "2026-05-12T01:23:45+09:00",
  "card": { "issuerCode": "..", "acquirerCode": "..", "number": "433012****1234", "cardType": "신용", "ownerType": "개인" },
  "createdAt": "2026-05-12T01:23:50.000Z"
}
```

### `users/{uid}.subscription`
현재 구독 상태.

```json
{
  "plan": "premium",
  "expiresAt": "2026-06-11T01:23:50.000Z",
  "lastOrderId": "sub_1715476430000_a1b2c3",
  "lastPaymentKey": "...",
  "amount": 4900,
  "paidAt": "2026-05-12T01:23:50.000Z"
}
```

### `payments/{paymentKey}`
결제 이력.

```json
{
  "uid": "abc123",
  "orderId": "sub_...",
  "paymentKey": "...",
  "amount": 4900,
  "type": "subscription-initial" | "subscription-renewal",
  "status": "DONE",
  "method": "카드",
  "approvedAt": "...",
  "createdAt": "..."
}
```

---

## 4. API 엔드포인트

### `POST /api/billing/issue`
- **Auth**: `Authorization: Bearer <firebase-id-token>`
- **Body**: `{ authKey, customerKey }`
- **동작**: authKey를 billingKey로 교환 → Firestore에 저장 → 즉시 첫달 4,900원 결제 → 구독 활성화
- **Response (성공)**: `{ success: true, subscription: {...} }`

### `POST /api/billing/charge`
- **Auth**: `Authorization: Bearer <firebase-id-token>`
- **Body**: `{}` (Firestore에 저장된 본인 billingKey 사용)
- **동작**: 저장된 billingKey로 4,900원 결제 → 30일 연장
- **Response (성공)**: `{ success: true, subscription: {...} }`
- **용도**: 사용자가 수동으로 갱신 결제 / 추후 cron 자동 호출용

---

## 5. 토스 심사 체크리스트

- [ ] 라이브 가맹점 신청 (토스 사업자 페이지)
- [ ] 라이브 클라이언트 키 발급 (`live_ck_...`) — index.html `TossPayments()` 인자 교체
- [ ] 라이브 시크릿 키 발급 (`live_sk_...`) — Vercel 환경변수 교체
- [ ] 결제 흐름 데모 동영상 (카드 등록 → 결제 → 구독 활성화)
- [ ] 환불 정책 / 약관 / 개인정보처리방침 페이지 노출 확인
- [ ] (권장) 웹훅 등록 — 결제 실패/취소 이벤트 수신

---

## 6. 다음 라운드 (옵션)

- Vercel Cron으로 매월 자동 청구
- 토스 웹훅 받기 (`/api/billing/webhook`)
- 환불 API (`/api/billing/cancel`)
- 카드 변경 (재인증 흐름)
