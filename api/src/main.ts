import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', {
    // 알림 딥링크는 /n/:deliveryId 하나의 형태다(design/20 §5.3). API 접두어 밖에 둔다.
    exclude: ['n/:deliveryId'],
  });
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: process.env.APP_BASE_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  // 개발용 API 목록. 운영에서는 노출하지 않는다.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SSAFY Connection API')
      .setDescription('design/22_API_SPEC.md 참조. 세션 쿠키(sn_session)로 인증한다.')
      .setVersion('0.1.0')
      .addCookieAuth('sn_session')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`api http://localhost:${port}/api`);
}

void bootstrap();
