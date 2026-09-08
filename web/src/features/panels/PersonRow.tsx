import type { PublicUser, RelationStatus } from '@ssafy-net/shared';

const RELATION_LABEL: Partial<Record<RelationStatus, string>> = {
  CONNECTED: '연결됨',
  REQUEST_SENT: '요청 보냄',
  REQUEST_RECEIVED: '요청 받음',
  NO_RESPONSE: '응답 없음',
};

/**
 * 사람 한 줄. 목록 어디서나 같은 모양을 쓴다.
 * 이미 처리한 사람은 흐리게 하되 목록에서 지우지 않는다(docs/13 §3.4).
 */
export function PersonRow({
  user,
  commonCount,
  onClick,
}: {
  user: PublicUser;
  commonCount?: number;
  onClick: () => void;
}) {
  const state = RELATION_LABEL[user.relation.status];
  const handled =
    user.relation.status === 'CONNECTED' ||
    user.relation.status === 'REQUEST_SENT' ||
    user.relation.status === 'NO_RESPONSE';

  return (
    <button
      type="button"
      className={`person-row ${handled ? 'dimmed' : ''}`}
      onClick={onClick}
    >
      <span className="name">{user.displayName}</span>
      {/* 실명 사용자는 구분 표시가 붙는다(FR-0.5) */}
      {user.displayNameType === 'REAL' && <span className="badge real">실명</span>}
      {state && <span className="badge state">{state}</span>}
      <span className="meta">
        공통 {commonCount ?? user.commonCount}개
      </span>
    </button>
  );
}
