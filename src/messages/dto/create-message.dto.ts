import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChatwootContentType } from '../chatwoot/chatwoot.types.js';

/**
 * Body accepted by `POST /messages`, the way in that does not go through
 * Chatwoot. Named after Chatwoot's own fields so both paths carry the same
 * data.
 */
export class CreateMessageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  accountId: number;

  /** Chatwoot's `display_id` for the conversation. */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  conversationId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content: string;

  @IsOptional()
  @IsEnum(ChatwootContentType)
  contentType?: ChatwootContentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  senderId?: number;
}
