import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '../api/client';
import {
  Muted,
  Page,
  PageLede,
  PageTitle,
  ScrollPage,
  SectionTitle,
  Tag,
} from '../components/primitives';
import { InterestPicker } from '../features/interests/InterestPicker';
import { MyPosts } from '../features/posts/MyPosts';
import { DisplayNameForm } from '../features/profile/DisplayNameForm';
import { useSession } from '../session';

/** "9월 11일 오후 2:20" — 다음 변경 가능 시각 안내에 쓴다. */
const formatWhen = (date: Date) =>
  date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * My Profile (docs/06 §3.10).
 *
 * 남에게 보이는 모습을 "연결 전 / 연결 후" 두 가지로 미리 보여준다.
 * 표시명 선택의 결과를 여기서 실감하게 하는 것이 목적이다.
 *
 * 표시명(닉네임 ↔ 실명)은 여기서 바꾼다. 하루 1회(docs/12 §3).
 * 관심사 수정은 온보딩과 같은 화면을 쓴다(D-24).
 */
export function ProfilePage() {
  const { me, reload } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);

  if (!me) return null;

  // 하루 1회 규칙. 서버가 다음 변경 가능 시각을 준다(지금 되면 null).
  const nextChangeAt = me.displayNameChangeableAt
    ? new Date(me.displayNameChangeableAt)
    : null;
  const blockedReason =
    nextChangeAt && nextChangeAt.getTime() > Date.now()
      ? `표시명은 하루에 한 번 바꿀 수 있습니다. ${formatWhen(nextChangeAt)} 이후에 다시 바꿀 수 있습니다.`
      : null;

  return (
    <ScrollPage>
      <Page>
        <PageTitle>내 프로필</PageTitle>
        <PageLede>
          관심사는 조직 구성원 전체에게 보입니다. 실명은 연결이 성립될 때만
          공개됩니다.
        </PageLede>

        {/* "연결 전 / 연결 후" 두 장. 좁으면 세로로 쌓인다. */}
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <Card className="gap-0 rounded-xl py-[22px] max-sm:py-[18px]">
            <CardContent className="px-6 max-sm:px-[18px]">
              <Muted>연결 전에 보이는 모습</Muted>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-tight">
                {me.displayName}
                {me.displayNameType === 'REAL' && <Tag tone="real">실명</Tag>}
              </div>
              <Muted className="text-[12.5px]">관심사 {me.interests.length}개</Muted>
            </CardContent>
          </Card>

          <Card className="gap-0 rounded-xl py-[22px] max-sm:py-[18px]">
            <CardContent className="px-6 max-sm:px-[18px]">
              <Muted>연결된 상대에게 보이는 모습</Muted>
              <div className="mt-1 text-[17px] font-semibold tracking-tight">
                {me.realName}
              </div>
              <Muted className="text-[12.5px]">관심사 {me.interests.length}개</Muted>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <SectionTitle>표시명</SectionTitle>
          <Muted>
            바꾸면 진행 중인 요청의 상대와 추천 목록에도 새 표시명이 보입니다.
            하루에 한 번 바꿀 수 있습니다.
          </Muted>
          {editingName ? (
            <div className="mt-3">
              <DisplayNameForm
                realNamePreview={me.realName || null}
                initial={{
                  type: me.displayNameType,
                  nickname:
                    me.displayNameType === 'NICKNAME' ? me.displayName : null,
                }}
                submitLabel="저장"
                blockedReason={blockedReason}
                onSubmit={async (input) => {
                  await api.patch('/me/display-name', input);
                  await reload();
                  setEditingName(false);
                  toast.success('표시명을 바꿨습니다.');
                }}
                onCancel={() => setEditingName(false)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => setEditingName(true)}
            >
              표시명 바꾸기
            </Button>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>관심사 수정</SectionTitle>
          <Muted>저장하면 그래프와 추천이 즉시 바뀝니다.</Muted>
          {notice && <Muted>{notice}</Muted>}
          <InterestPicker
            submitLabel="저장"
            onSaved={(message) => {
              setNotice(message);
              void reload();
            }}
          />
        </div>

        <div className="mt-6">
          <SectionTitle>내가 쓴 글</SectionTitle>
          <MyPosts />
        </div>
      </Page>
    </ScrollPage>
  );
}
