/**
 * 목록이 오기 전에 보여주는 자리 표시.
 *
 * "불러오는 중…" 글자 대신 목록과 같은 모양을 먼저 그린다.
 * 데이터가 오기 전에 빈 상태 문구("아직 받은 요청이 없습니다")가 잠깐 뜨는 것을 막는 것이 목적이다.
 */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-row">
          <div className={`skeleton-line ${index % 2 === 0 ? 'w60' : 'w40'}`} />
          <div className="skeleton-line thin w80" />
        </div>
      ))}
    </div>
  );
}
