/**
 * 개발 서버(dev.<도메인>)에서만 뜨는 띠. 운영 서버와 화면이 똑같아서 헷갈리지 않게 한다(deploy/README.md §11).
 *
 * 같은 이미지가 두 서버에 올라가므로 빌드 시점에는 구분할 수 없다. 호스트 이름이 `dev.` 로 시작하는지로 판단한다 —
 * 개발 서버의 주소를 바꾸면 여기도 바꾼다. 데모 빌드의 띠(mocks/DemoBanner)와는 다르다:
 * 저기는 서버가 없고, 여기는 서버가 있되 더미 데이터다.
 */
export const DEV_SERVER =
  typeof window !== 'undefined' && window.location.hostname.startsWith('dev.');

export function DevServerBanner() {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2.5 bg-[#1c2b3a] px-4 py-2 text-[13px] text-[#e9f1f8]">
      <span className="flex-none rounded-full bg-[#f0b429] px-2 py-0.5 text-xs font-bold tracking-wide text-[#23303d]">
        개발 서버
      </span>
      <span className="min-w-0 flex-[1_1_240px] opacity-85 max-[560px]:hidden">
        더미 데이터로 도는 미리보기입니다. dev 브랜치가 여기로 오고, 실제 서비스가 아닙니다.
      </span>
    </div>
  );
}
