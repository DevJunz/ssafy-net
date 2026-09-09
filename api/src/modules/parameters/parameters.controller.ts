import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParametersService } from './parameters.service';

@ApiTags('파라미터')
@Controller('parameters')
export class ParametersController {
  constructor(private readonly parameters: ParametersService) {}

  /**
   * 프론트는 "최소 5 · 최대 15" 같은 문구를 이 응답으로 만든다(design/20 §9).
   * 상수를 화면에 박으면 서버 값과 갈라진다.
   * 온보딩 소개 화면에 필요하므로 비로그인에서도 열려 있다.
   */
  @Get()
  @ApiOperation({
    summary: 'Product Parameter와 기능 플래그',
    description:
      '비로그인. `{ parameters: { "P-01": 5, "P-02": 15, ... }, features: { network_enabled: false } }`.\n\n' +
      '프론트는 "최소 5 · 최대 15" 같은 문구를 이 응답으로 만든다(design/20 §9). 상수를 화면에 박지 않는다. ' +
      '값은 DB(`AppParameter`)에 있고 서버가 30초 캐시한다. 파라미터 목록은 docs/02 §8.',
  })
  async get() {
    const [parameters, features] = await Promise.all([
      this.parameters.all(),
      this.parameters.allFlags(),
    ]);
    return { parameters, features };
  }
}
