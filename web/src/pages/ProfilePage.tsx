import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '../api/client';
import {
  Chips,
  ChipTag,
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
import { ProfileMessageForm } from '../features/profile/ProfileMessageForm';
import { RealNameForm } from '../features/profile/RealNameForm';
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
 * 표시명(닉네임 ↔ 실명, 닉네임 바꾸기)은 하루 1회(docs/12 §3).
 * 실명(이름·반)은 언제든 고친다 — 연결된 상대에게 보이는 이름이라 오타를 막지 않는다.
 * 관심사 수정은 온보딩과 같은 화면을 쓴다(D-24).
 */
export function ProfilePage() {
  const { me, reload } = useSession();
  const [editingName, setEditingName] = useState(false);
  const [editingInterests, setEditingInterests] = useState(false);
  const [editingRealName, setEditingRealName] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);

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
              {me.profileMessage && (
                <p className="mt-1 mb-0 text-[13px] leading-snug whitespace-pre-wrap text-foreground/80">
                  {me.profileMessage}
                </p>
              )}
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
            닉네임으로 활동할지 실명으로 활동할지 고르고, 닉네임도 여기서 바꿉니다.
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
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-semibold">
                {me.displayNameType === 'REAL' ? '실명으로 활동 중' : '닉네임으로 활동 중'}
                {me.displayNameType === 'NICKNAME' && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {me.displayName}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingName(true)}
              >
                표시명 바꾸기
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>프로필 메시지</SectionTitle>
          <Muted>
            나를 눌렀을 때 표시명 아래에 보이는 한 줄입니다. 무엇을 이야기하고 싶은지
            적어 두면 상대가 요청 메시지를 쓰기 쉬워집니다.
          </Muted>
          {editingMessage ? (
            <div className="mt-3">
              <ProfileMessageForm
                initial={me.profileMessage}
                onSubmit={async (message) => {
                  await api.patch('/me/profile-message', { message });
                  await reload();
                  setEditingMessage(false);
                  toast.success(message ? '프로필 메시지를 저장했습니다.' : '프로필 메시지를 지웠습니다.');
                }}
                onCancel={() => setEditingMessage(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] whitespace-pre-wrap">
                {me.profileMessage || <span className="text-muted-foreground">아직 없음</span>}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMessage(true)}
              >
                {me.profileMessage ? '메시지 수정' : '메시지 쓰기'}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>실명</SectionTitle>
          <Muted>
            연결이 성립된 상대에게 보이는 이름입니다. 실명으로 활동 중이면 처음부터
            보입니다. 이름과 반을 고칠 수 있습니다.
          </Muted>
          {editingRealName ? (
            <div className="mt-3">
              <RealNameForm
                initial={{
                  realName: me.identity.realName ?? '',
                  classNo: me.identity.classNo ?? '',
                }}
                onSubmit={async (input) => {
                  await api.patch('/me/real-name', input);
                  await reload();
                  setEditingRealName(false);
                  toast.success('실명을 바꿨습니다.');
                }}
                onCancel={() => setEditingRealName(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-semibold">{me.realName || '아직 없음'}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRealName(true)}
              >
                실명 수정
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>내가 쓴 글</SectionTitle>
          <MyPosts />
        </div>

        <div className="mt-6">
          <SectionTitle>관심사</SectionTitle>
          <Muted>
            그래프와 추천의 재료입니다. 저장하면 그래프와 추천이 즉시 바뀝니다.
          </Muted>
          {editingInterests ? (
            // 온보딩과 같은 선택 화면(D-24)을 상자에 넣는다. 안에서 스크롤하고 저장·취소는 발에 있다.
            <div className="mt-3 overflow-hidden rounded-xl border bg-card shadow-xs">
              <InterestPicker
                embedded
                submitLabel="저장"
                onSaved={async (message) => {
                  await reload();
                  setEditingInterests(false);
                  toast.success(message ?? '관심사를 저장했습니다.');
                }}
                onCancel={() => setEditingInterests(false)}
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chips>
                {me.interests.map((interest) => (
                  <ChipTag key={interest.id}>{interest.name}</ChipTag>
                ))}
              </Chips>
              <Button
                type="button"
                variant="outline"
                className="ml-1"
                onClick={() => setEditingInterests(true)}
              >
                관심사 수정
              </Button>
            </div>
          )}
        </div>
      </Page>
    </ScrollPage>
  );
}
