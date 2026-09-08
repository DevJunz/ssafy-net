import { Controller, Get } from '@nestjs/common';
import { ParametersService } from './parameters.service';

@Controller('parameters')
export class ParametersController {
  constructor(private readonly parameters: ParametersService) {}

  /**
   * 프론트는 "최소 5 · 최대 15" 같은 문구를 이 응답으로 만든다(design/20 §9).
   * 상수를 화면에 박으면 서버 값과 갈라진다.
   * 온보딩 소개 화면에 필요하므로 비로그인에서도 열려 있다.
   */
  @Get()
  async get() {
    const [parameters, features] = await Promise.all([
      this.parameters.all(),
      this.parameters.allFlags(),
    ]);
    return { parameters, features };
  }
}
