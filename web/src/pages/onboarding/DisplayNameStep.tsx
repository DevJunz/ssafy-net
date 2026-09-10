import { api } from '../../api/client';
import { Muted } from '../../components/primitives';
import { DisplayNameForm } from '../../features/profile/DisplayNameForm';

/**
 * 표시명 선택 (docs/06 §3.1.3). 온보딩 2단계.
 * 폼은 My Profile 의 표시명 변경과 같은 것이다(DisplayNameForm).
 */
export function DisplayNameStep({
  realNamePreview,
  onDone,
}: {
  realNamePreview: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl">다른 사람에게 어떻게 보일까요?</h2>
      <DisplayNameForm
        realNamePreview={realNamePreview}
        submitLabel="다음"
        note={<Muted>나중에 내 프로필에서 바꿀 수 있습니다.</Muted>}
        onSubmit={async (input) => {
          await api.post('/onboarding/display-name', input);
          onDone();
        }}
      />
    </div>
  );
}
