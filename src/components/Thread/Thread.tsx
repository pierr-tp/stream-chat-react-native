import React, { useEffect } from 'react';

import type { Message as StreamMessage } from 'stream-chat';

import DefaultMessage from '../Message/Message';
import DefaultMessageInput, {
  MessageInputProps,
} from '../MessageInput/MessageInput';
import DefaultMessageList, {
  MessageListProps,
} from '../MessageList/MessageList';

import type { MessageSimpleProps } from '../Message/MessageSimple/MessageSimple';

import { useChannelContext } from '../../contexts/channelContext/ChannelContext';
import { useMessagesContext } from '../../contexts/messagesContext/MessagesContext';
import { useThreadContext } from '../../contexts/threadContext/ThreadContext';
import { useTranslationContext } from '../../contexts/translationContext/TranslationContext';
import { styled } from '../../styles/styledComponents';
import { themed } from '../../styles/theme';

import type {
  DefaultAttachmentType,
  DefaultChannelType,
  DefaultCommandType,
  DefaultEventType,
  DefaultMessageType,
  DefaultReactionType,
  DefaultUserType,
} from '../../types/types';

const NewThread = styled.View`
  align-items: center;
  background-color: #f4f9ff;
  border-radius: 4px;
  margin: 10px;
  padding: 8px;
  ${({ theme }) => theme.thread.newThread.css};
`;

const NewThreadText = styled.Text`
  ${({ theme }) => theme.thread.newThread.text.css};
`;

export type ThreadProps<
  At extends Record<string, unknown> = DefaultAttachmentType,
  Ch extends Record<string, unknown> = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Ev extends Record<string, unknown> = DefaultEventType,
  Me extends Record<string, unknown> = DefaultMessageType,
  Re extends Record<string, unknown> = DefaultReactionType,
  Us extends Record<string, unknown> = DefaultUserType
> = {
  /**
   * Additional props for underlying MessageInput component.
   * Available props - https://getstream.github.io/stream-chat-react-native/#messageinput
   * */
  additionalMessageInputProps?: Partial<
    MessageInputProps<At, Ch, Co, Ev, Me, Re, Us>
  >;
  /**
   * Additional props for underlying MessageList component.
   * Available props - https://getstream.github.io/stream-chat-react-native/#messagelist
   * */
  additionalMessageListProps?: Partial<
    MessageListProps<At, Ch, Co, Ev, Me, Re, Us>
  >;
  /**
   * Additional props for underlying Message component of parent message at the top.
   * Available props - https://getstream.github.io/stream-chat-react-native/#message
   * */
  additionalParentMessageProps?: Partial<
    MessageSimpleProps<At, Ch, Co, Ev, Me, Re, Us>
  >;
  /** Make input focus on mounting thread */
  autoFocus?: boolean;
  /** Disables the thread UI. So MessageInput and MessageList will be disabled. */
  disabled?: boolean;
  /**
   * Custom UI component to display a message in MessageList component
   * Default component (accepts the same props): [MessageSimple](https://getstream.github.io/stream-chat-react-native/#messagesimple)
   * */
  Message?: React.ComponentType<MessageSimpleProps<At, Ch, Co, Ev, Me, Re, Us>>;
  /**
   * **Customized MessageInput component to used within Thread instead of default MessageInput
   * **Available from [MessageInput](https://getstream.github.io/stream-chat-react-native/#messageinput)**
   */
  MessageInput?: React.ComponentType<
    MessageInputProps<At, Ch, Co, Ev, Me, Re, Us>
  >;
  /**
   * **Customized MessageList component to used within Thread instead of default MessageList
   * **Available from [MessageList](https://getstream.github.io/stream-chat-react-native/#messagelist)**
   * */
  MessageList?: React.ComponentType<
    MessageListProps<At, Ch, Co, Ev, Me, Re, Us>
  >;
};

/**
 * Thread - The Thread renders a parent message with a list of replies. Use the standard message list of the main channel's messages.
 * The thread is only used for the list of replies to a message.
 *
 * Thread is a consumer of [channel context](https://getstream.github.io/stream-chat-react-native/#channelcontext)
 * Underlying MessageList, MessageInput and Message components can be customized using props:
 * - additionalParentMessageProps
 * - additionalMessageListProps
 * - additionalMessageInputProps
 *
 * @example ./Thread.md
 */
const Thread = <
  At extends Record<string, unknown> = DefaultAttachmentType,
  Ch extends Record<string, unknown> = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Ev extends Record<string, unknown> = DefaultEventType,
  Me extends Record<string, unknown> = DefaultMessageType,
  Re extends Record<string, unknown> = DefaultReactionType,
  Us extends Record<string, unknown> = DefaultUserType
>(
  props: ThreadProps<At, Ch, Co, Ev, Me, Re, Us>,
) => {
  const { t } = useTranslationContext();
  const { channel } = useChannelContext<At, Ch, Co, Ev, Me, Re, Us>();
  const { Message: MessageFromContext } = useMessagesContext<
    At,
    Ch,
    Co,
    Ev,
    Me,
    Re,
    Us
  >();
  const { loadMoreThread, thread } = useThreadContext<
    At,
    Ch,
    Co,
    Ev,
    Me,
    Re,
    Us
  >();
  const {
    autoFocus = true,
    Message: MessageFromProps,
    MessageList = DefaultMessageList,
    MessageInput = DefaultMessageInput,
    additionalParentMessageProps,
    disabled,
    additionalMessageListProps,
    additionalMessageInputProps,
  } = props;

  const Message = (MessageFromProps ||
    MessageFromContext) as React.ComponentType<
    MessageSimpleProps<At, Ch, Co, Ev, Me, Re, Us>
  >;

  useEffect(() => {
    const loadMoreThreadAsync = async () => {
      await loadMoreThread();
    };

    if (thread && thread.id && thread.reply_count) {
      loadMoreThreadAsync();
    }
  }, []);

  if (!thread) {
    return null;
  }

  const headerComponent = (
    <>
      <DefaultMessage<At, Ch, Co, Ev, Me, Re, Us>
        {...additionalParentMessageProps}
        groupStyles={['single']}
        message={thread}
        Message={Message}
        threadList
      />
      <NewThread>
        <NewThreadText>{t('Start of a new thread')}</NewThreadText>
      </NewThread>
    </>
  );

  // this ensures that if you switch thread the component is recreated
  const key = `thread-${thread.id}-${channel?.cid || ''}`;

  return (
    <React.Fragment key={key}>
      <MessageList<At, Ch, Co, Ev, Me, Re, Us>
        {...additionalMessageListProps}
        HeaderComponent={headerComponent}
        Message={Message}
        threadList
      />
      <MessageInput<At, Ch, Co, Ev, Me, Re, Us>
        {...additionalMessageInputProps}
        additionalTextInputProps={{ autoFocus, editable: !disabled }}
        parent_id={thread.id as StreamMessage<At, Me, Us>['parent_id']}
      />
    </React.Fragment>
  );
};

Thread.themePath = 'thread';

export default themed(Thread) as typeof Thread;