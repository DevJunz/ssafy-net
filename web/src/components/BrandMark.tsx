/**
 * 서비스 마크. public/favicon.svg 와 같은 그림이다 — 관심사(큰 원)와 사람(작은 점)이 선으로 이어진 그래프.
 * 내비게이션과 소개 화면에서 글자 옆에 놓인다.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="#1c7ed6" />
      <g stroke="#fff" strokeWidth="1.6" opacity="0.85">
        <line x1="16" y1="16" x2="8" y2="8" />
        <line x1="16" y1="16" x2="25" y2="11" />
        <line x1="16" y1="16" x2="10" y2="24" />
        <line x1="16" y1="16" x2="24" y2="23" />
      </g>
      <g fill="#fff">
        <circle cx="16" cy="16" r="4.5" />
        <circle cx="8" cy="8" r="2.4" />
        <circle cx="25" cy="11" r="2.4" />
        <circle cx="10" cy="24" r="2.4" />
        <circle cx="24" cy="23" r="2.4" />
      </g>
    </svg>
  );
}
