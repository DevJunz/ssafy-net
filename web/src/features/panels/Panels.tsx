import type {
  ConnectedUser,
  GraphResponse,
  InterestDetail,
  PublicUser,
  SimilarPeopleResponse,
} from '@ssafy-net/shared';
import { categoryVar, INTEREST_VAR, ME_VAR, PERSON_VAR } from '../graph/encoding';
import { PostComposer, PostList } from '../posts/PostList';
import { PersonRow } from './PersonRow';

/** 패널: 기본 (docs/05 §3.3) — 무엇을 할지 알려주고 추천 진입점을 준다. */
export function BasePanel({
  graph,
  anchorNames,
  similarTotal,
  onSimilarMode,
}: {
  graph: GraphResponse | null;
  /** 앵커가 관심사일 때 그 이름들. 비어 있으면 내 그래프다. */
  anchorNames: string[];
  similarTotal: number | null;
  onSimilarMode: () => void;
}) {
  const categories = new Map<string, string>();
  let peopleInGraph = 0;
  graph?.nodes.forEach((node) => {
    if (node.kind === 'INTEREST') categories.set(node.categoryId, node.name);
    if (node.kind === 'PERSON') peopleInGraph += 1;
  });
  const peopleTotal = peopleInGraph + (graph?.truncated.people ?? 0);

  return (
    <div className="panel">
      {anchorNames.length === 0 ? (
        <>
          <h2>내 그래프</h2>
          <p className="muted">사람이나 관심사를 눌러보세요.</p>
        </>
      ) : (
        <>
          <h2>{anchorNames.map((name) => `#${name}`).join(' · ')}</h2>
          <p className="muted">
            {anchorNames.length === 1
              ? `이 관심사를 가진 사람 ${peopleTotal}명`
              : `${anchorNames.length}개를 모두 가진 사람 ${peopleTotal}명`}
            {graph && peopleTotal === 0 && ' · 다른 관심사를 빼 보세요.'}
          </p>
        </>
      )}

      {anchorNames.length === 0 && (
        <div className="section">
          <button type="button" className="primary" onClick={onSimilarMode}>
            나와 비슷한 사람 보기
            {similarTotal !== null && ` (${similarTotal}명)`}
          </button>
        </div>
      )}

      {anchorNames.length > 0 && (
        <div className="section notice">
          관심사 노드를 <b>Shift+클릭</b>하면 그 관심사도 가진 사람만 남깁니다.
          위쪽 칩의 ×로 하나씩 뺄 수 있습니다.
        </div>
      )}

      <div className="section">
        <div className="legend">
          <span><i style={{ background: ME_VAR }} /> 나</span>
          <span><i style={{ background: PERSON_VAR }} /> 사람</span>
          <span><i style={{ background: INTEREST_VAR }} /> 관심사</span>
          <span><i className="hollow" /> 인접 관심사</span>
        </div>
      </div>

      {categories.size > 0 && (
        <div className="section">
          <div className="legend">
            {[...categories.keys()].map((id) => (
              <span key={id}>
                <i style={{ background: categoryVar(id) }} />
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
  anchorCount,
  inAnchor,
  onRecenter,
  onAddToAnchor,
  onRemoveFromAnchor,
  onSelectPerson,
  onAddToMine,
  onReload,
}: {
  detail: InterestDetail;
  /** 지금 앵커인 관심사 수. 0이면 내 그래프다. */
  anchorCount: number;
  /** 이 관심사가 앵커에 들어 있는지 */
  inAnchor: boolean;
  onRecenter: () => void;
  /** 앵커에 더해 "함께 가진 사람만" 남긴다(D-76) */
  onAddToAnchor: () => void;
  onRemoveFromAnchor: () => void;
  onSelectPerson: (userId: string) => void;
  onAddToMine: () => void;
  onReload: () => void;
}) {
  return (
    <div className="panel">
      <h2>
        {detail.name}
        {detail.mine && <span className="badge state">내 관심사</span>}
        {inAnchor && anchorCount > 1 && (
          <span className="badge state">함께 보는 중</span>
        )}
      </h2>
      <p className="muted">
        {detail.categoryName} · {detail.holderCount}명
      </p>

      <div className="section row wrap">
        {anchorCount === 0 && (
          <button type="button" onClick={onRecenter}>
            이 관심사를 중심으로 보기
          </button>
        )}
        {anchorCount > 0 && !inAnchor && (
          <>
            <button type="button" className="primary" onClick={onAddToAnchor}>
              함께 가진 사람만 보기
            </button>
            <button type="button" onClick={onRecenter}>
              이 관심사만 중심으로
            </button>
          </>
        )}
        {inAnchor && anchorCount > 1 && (
          <button type="button" onClick={onRemoveFromAnchor}>
            함께 보기에서 빼기
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

      {/* 글은 "이 관심사에서 누가 활동하는지"를 드러내는 장치다(docs/11 §1) */}
      <div className="section">
        <div className="muted" style={{ marginBottom: 8 }}>최근 글</div>
        <PostList posts={detail.posts} onSelectAuthor={onSelectPerson} />
        <div style={{ marginTop: 10 }}>
          {detail.canPost ? (
            <PostComposer
              interestId={detail.id}
              interestName={detail.name}
              onPosted={onReload}
            />
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>
              이 관심사를 추가하면 글을 남길 수 있습니다.
            </p>
          )}
        </div>
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
          <span className="badge real">실명</span>
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

      {person.recentPosts && person.recentPosts.length > 0 && (
        <div className="section">
          <div className="muted" style={{ marginBottom: 8 }}>최근 글</div>
          <div className="list">
            {person.recentPosts.map((post) => (
              <div key={post.id} className="post">
                <div className="post-body">{post.content}</div>
                <div className="post-foot">
                  <span>#{post.interestName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
