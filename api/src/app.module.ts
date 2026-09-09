import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { JobsModule } from './jobs/jobs.module';
import { MattermostModule } from './infra/mattermost/mattermost.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { GraphModule } from './modules/graph/graph.module';
import { HealthModule } from './modules/health/health.module';
import { InterestsModule } from './modules/interests/interests.module';
import { NetworksModule } from './modules/networks/networks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ParametersModule } from './modules/parameters/parameters.module';
import { PostsModule } from './modules/posts/posts.module';
import { CommonInterestsModule } from './modules/recommendation/common-interests.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { PresenterModule } from './modules/users/presenter.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 배치는 인프로세스 cron이다. 프로세스가 하나라 분산 락이 필요 없다(design/20 §7).
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    MattermostModule,
    ParametersModule,
    PresenterModule,
    AuthModule,
    CommonInterestsModule,
    ConnectionsModule,
    UsersModule,
    PostsModule,
    InterestsModule,
    OnboardingModule,
    GraphModule,
    RecommendationModule,
    NetworksModule,
    NotificationsModule,
    JobsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
