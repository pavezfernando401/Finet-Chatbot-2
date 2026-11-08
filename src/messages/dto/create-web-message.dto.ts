import {
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Body accepted by `POST /web/messages`: one visitor turn from the site's
 * chat widget, relayed by the site's backend.
 */
export class CreateWebMessageDto {
  /**
   * The visitor's anonymous session, minted by the widget. It is the
   * conversation, so it has to be unguessable — hence a UUID and not a
   * counter.
   */
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content: string;

  /** Portal JWT, forwarded only to finet-clientes for authenticated support. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken?: string;

  /** The visitor's address, which limits how many RUTs they can try. */
  @IsOptional()
  @IsIP()
  clientIp?: string;
}
