import type {
  ConnectedUser,
  GraphResponse,
  InterestDetail,
  PublicUser,
  SimilarPeopleResponse,
} from '@ssafy-net/shared';
import { colorForCategory, ME_COLOR, PERSON_COLOR } from '../graph/encoding';
import { PersonRow } from './PersonRow';

/** 패널: 기본 (docs/05 §3.3) — 무엇을 할지 알려주고 추천 진입점을 준다. */
export function BasePanel({
  graph,
  similarTotal,
  onSimilarMode,
}: {
  graph: GraphResponse | null;
  similarTotal: number | null;
  onSimilarMode: () => void;
}) {
  const categories = new Map<string, string>();
  graph?.nodes.forEach((node) => {
    if (node.kind === 'INTEREST') categories.set(node.categoryId, node.name);
  });

  return (
    <div className="panel">
      <h2>내 그래프</h2>
      <p className="muted">사람이나 관심사를 눌러보세요.</p>

      <div className="section">
        <button type="button" className="primary" onClick={onSimilarMode}>
          나와 비슷한 사람 보기
          {similarTotal !== null && ` (${similarTotal}명)`}
        </button>
      </div>

      <div className="section">
        <div className="legend">
          <span><i style={{ background: ME_COLOR }} /> 나</span>
          <span><i style={{ background: PERSON_COLOR }} /> 사람</span>
          <span><i style={{ background: '#1c7ed6' }} /> 관심사</span>
          <span><i style={{ background: '#fff', border: '1.5px dashed #868e96' }} /> 인접 관심사</span>
        </div>
      </div>

      {categories.size > 0 && (
        <div className="section">
          <div className="legend">
            {[...categories.keys()].map((id) => (
              <span key={id}>
                <i style={{ background: colorForCategory(id) }} />
                {/* Category 이름은 관심사 노드에서 알 수 없으므로 색만 보여준다 */}
              </span>
            ))}
          </div>
        </div>
      )}

      {graph && (graph.truncated.people > 0 || graph.truncated.interests > 0) && (
        <div className="section notice">
          나와 공통 관심사가 많은 순으로 보여줍니다.
          {graph.truncated.people > 0 && ` 사람 ${graph.truncated.people}명 더 있음.`}
          {graph.truncated.interests > 0 && ` 관심사 ${graph.truncated.interests}개 더 있음.`}
        </div>
      )}
    </div>
  );
}

/** 패널: Interest 상세 (docs/06 §3.3) */
export function InterestPanel({
  detail,
  isAnchor,
  onRecenter,
  onSelectPerson,
  onAddToMine,
}: {
  detail: InterestDetail;
  isAnchor: boolean;
  onRecenter: () => void;
  onSelectPerson: (userId: string) => void;
  onAddToMine: () => void;
}) {
  return (
    <div className="panel">
      <h2>
        {detail.name}
        {detail.mine && <span className="badge state" style={{ marginLeft: 8 }}>내 관심사</span>}
      </h2>
      <p className="muted">
        {detail.categoryName} · {detail.holderCount}명
      </p>

      <div className="section row">
        {!isAnchor && (
          <button type="button" onClick={onRecenter}>
            이 관심사를 중심으로 보기
          </button>
        )}
        {!detail.mine && (
          <button type="button" onClick={onAddToMine}>
            내 관심사에 추가
          </button>
        )}
      </div>

      <div className="section">
        <div className="muted" style={{ marginBottom: 8 }}>
          나와 공통 관심사가 많은 순 · {detail.peopleTotal}명
        </div>
        {detail.people.length === 0 ? (
          <div className="notice">
            아직 이 관심사를 가진 다른 사람이 없습니다.
          </div>
        ) : (
          <div className="list">
            {detail.people.map((item) => (
              <PersonRow
                key={item.user.id}
                user={item.user}
                commonCount={item.commonCount}
                onClick={() => onSelectPerson(item.user.id)}
              />
            ))}
          </div>
        )}
        {detail.peopleTotal > detail.people.length && (
          <p className="muted" style={{ marginTop: 8 }}>
            {detail.peopleTotal - detail.people.length}명 더 있음
          </p>
        )}
      </div>
    </div>
  );
}

/** 패널: Person Profile (docs/06 §3.4) */
export function PersonPanel({
  person,
  onSelectInterest,
  onRequest,
  onOpenConnection,
}: {
  person: PublicUser | ConnectedUser;
  onSelectInterest: (interestId: string) => void;
  onRequest: () => void;
  onOpenConnection: () => void;
}) {
  const common = person.interests.filter((i) => i.isCommon);
  const others = person.interests.filter((i) => !i.isCommon);
  const realName = (person as ConnectedUser).realName;

  return (
    <div className="panel">
      <h2>
        {person.displayName}
        {person.displayNameType === 'REAL' && (
          <span className="badge real" style={{ marginLeft: 8 }}>실명</span>
        )}
      </h2>
      {/* 실명은 연결됨 상태에서만 응답에 들어온다(docs/12 §1) */}
      {realName && <p className="muted">{realName}</p>}

      <div className="section">
        <div className="muted" style={{ marginBottom: 8 }}>
          공통 관심사 {common.length}개 / 상대 관심사 {person.interests.length}개
        </div>
        <div className="chips">
          {common.map((interest) => (
            <button
              key={interest.id}
              type="button"
              className="chip selected"
              onClick={() => onSelectInterest(interest.id)}
            >
              {interest.name}
            </button>
          ))}
          {others.map((interest) => (
            <button
              key={interest.id}
              type="button"
              className="chip"
              onClick={() => onSelectInterest(interest.id)}
            >
              {interest.name}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <PersonAction
          person={person}
          onRequest={onRequest}
          onOpenConnection={onOpenConnection}
        />
      </div>
    </div>
  );
}

/** 연결 상태에 따라 **가능한 행동 하나만** 보여준다(docs/06 §3.4). */
function PersonAction({
  person,
  onRequest,
  onOpenConnection,
}: {
  person: PublicUser;
  onRequest: () => void;
  onOpenConnection: () => void;
}) {
  switch (person.relation.status) {
    case 'SELF':
      return (
        <div className="notice">
          내 프로필입니다. 관심사는 내 프로필에서 수정합니다.
        </div>
      );
    case 'CONNECTED':
      return (
        <button type="button" className="primary" onClick={onOpenConnection}>
          연결됨 · 성립 화면 열기
        </button>
      );
    case 'REQUEST_SENT':
      return <button type="button" disabled>요청 보냄 · 응답 대기</button>;
    case 'REQUEST_RECEIVED':
      return (
        <div className="notice">
          이 사람이 먼저 요청했습니다. 연결 화면에서 수락하거나 거절할 수 있습니다.
        </div>
      );
    case 'NO_RESPONSE':
      return (
        <button type="button" disabled>
          응답 없음
          {person.relation.reRequestableAt &&
            ` · ${new Date(person.relation.reRequestableAt).toLocaleDateString('ko-KR')} 이후 다시 요청 가능`}
        </button>
      );
    default:
      return (
        <button type="button" className="primary" onClick={onRequest}>
          연결 요청
        </button>
      );
  }
}

/** 패널: Similar People (docs/06 §3.5) */
export function SimilarPanel({
  data,
  onSelectPerson,
  onClose,
}: {
  data: SimilarPeopleResponse;
  onSelectPerson: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="panel">
      <h2>나와 비슷한 사람 {data.total}명</h2>
      {/* 정렬 기준을 서버 문장 그대로 보여준다(docs/13 원칙 4) */}
      <p className="muted">
        공통 관심사 {data.criterion.minCommon}개 이상 · {data.criterion.sortBy}
      </p>

      <div className="section notice">
        선은 관심사가 겹친다는 뜻이며 아는 사이가 아닙니다.
      </div>

      {data.items.length === 0 ? (
        <div className="section notice">
          아직 공통 관심사가 {data.criterion.minCommon}개 이상인 사람이 없습니다.
          관심사를 더 고르면 비슷한 사람을 더 찾을 수 있습니다.
        </div>
      ) : (
        <div className="section list">
          {data.items.map((item) => (
            <div key={item.user.id}>
              <PersonRow
                user={item.user}
                commonCount={item.commonCount}
                onClick={() => onSelectPerson(item.user.id)}
              />
              {/* 이유는 완전해야 한다 — 이름을 전부 보여준다(원칙 3) */}
              <div className="chips" style={{ margin: '4px 0 8px 10px' }}>
                {item.commonInterests.map((interest) => (
                  <span key={interest.id} className="chip selected">
                    {interest.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <button type="button" onClick={onClose}>모드 끄기</button>
      </div>
    </div>
  );
}
