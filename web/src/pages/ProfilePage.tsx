import { useState } from 'react';
import { InterestPicker } from '../features/interests/InterestPicker';
import { MyPosts } from '../features/posts/MyPosts';
import { useSession } from '../session';

/**
 * My Profile (docs/06 §3.10).
 *
 * 남에게 보이는 모습을 "연결 전 / 연결 후" 두 가지로 미리 보여준다.
 * 표시명 선택의 결과를 여기서 실감하게 하는 것이 목적이다.
 *
 * 관심사 수정은 온보딩과 같은 화면을 쓴다(D-24).
 */
export function ProfilePage() {
  const { me, reload } = useSession();
  const [notice, setNotice] = useState<string | null>(null);

  if (!me) return null;

  return (
    <div className="scroll-page">
      <main className="page">
        <h1 className="page-title">내 프로필</h1>
        <p className="page-lede">
          관심사는 조직 구성원 전체에게 보입니다. 실명은 연결이 성립될 때만
          공개됩니다.
        </p>

        <div className="preview-pair">
          <div className="card">
            <span className="muted">연결 전에 보이는 모습</span>
            <div className="name">
              {me.displayName}
              {me.displayNameType === 'REAL' && (
                <span className="badge real">실명</span>
              )}
            </div>
            <div className="muted small">관심사 {me.interests.length}개</div>
          </div>

          <div className="card">
            <span className="muted">연결된 상대에게 보이는 모습</span>
            <div className="name">{me.realName}</div>
            <div className="muted small">관심사 {me.interests.length}개</div>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">관심사 수정</h2>
          <p className="muted">저장하면 그래프와 추천이 즉시 바뀝니다.</p>
          {notice && <p className="muted">{notice}</p>}
          <InterestPicker
            submitLabel="저장"
            onSaved={(message) => {
              setNotice(message);
              void reload();
            }}
          />
        </div>

        <div className="section">
          <h2 className="section-title">내가 쓴 글</h2>
          <MyPosts />
        </div>
      </main>
    </div>
  );
}
