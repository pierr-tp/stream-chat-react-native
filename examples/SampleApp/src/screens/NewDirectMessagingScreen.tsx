/* eslint-disable sort-keys */
import { useTheme } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Channel as StreamChatChannel } from 'stream-chat';
import {
  Channel,
  MessageInput,
  MessageList,
  SendButton,
  SendButtonProps,
} from 'stream-chat-react-native/v2';

import { UserSearchResults } from '../components/UserSearch/UserSearchResults';
import { AppContext } from '../context/AppContext';
import { usePaginatedUsers } from '../hooks/usePaginatedUsers';
import { AddUser } from '../icons/AddUser';
import { AppTheme, StackNavigatorParamList } from '../types';
import {
  LocalAttachmentType,
  LocalChannelType,
  LocalCommandType,
  LocalEventType,
  LocalMessageType,
  LocalReactionType,
  LocalUserType,
} from '../types';
import { SelectedUserTag } from '../components/UserSearch/SelectedUserTag';
import { RoundButton } from '../components/RoundButton';
import { Contacts } from '../icons/Contacts';
import { ScreenHeader } from '../components/ScreenHeader';
import { User } from '../icons/User';

export type SendMessageButtonProps = SendButtonProps;

export const SendMessageButton: React.FC<SendMessageButtonProps> = ({
  disabled,
  sendMessage,
}) => <SendButton disabled={disabled} sendMessage={sendMessage} />;

export type NewDirectMessagingScreenNavigationProp = StackNavigationProp<
  StackNavigatorParamList,
  'NewDirectMessagingScreen'
>;
export type NewDirectMessagingScreenProps = {
  navigation: NewDirectMessagingScreenNavigationProp;
};

export const NewDirectMessagingScreen: React.FC<NewDirectMessagingScreenProps> = ({
  navigation,
}) => {
  const { colors } = useTheme() as AppTheme;
  const { chatClient } = useContext(AppContext);

  const messageInputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);

  const messageInputText = useRef('');

  const currentChannel = useRef<
    StreamChatChannel<
      LocalAttachmentType,
      LocalChannelType,
      LocalCommandType,
      LocalEventType,
      LocalMessageType,
      LocalReactionType,
      LocalUserType
    >
  >(null);
  const [focusOnMessageInput, setFocusOnMessageInput] = useState(false);
  const [focusOnSearchInput, setFocusOnSearchInput] = useState(true);
  const [update, setUpdate] = useState(0);
  // @ts-ignore

  const {
    loading: loadingResults,
    loadMore,
    onChangeSearchText,
    onFocusInput,
    results,
    searchText,
    selectedUserIds,
    selectedUsers,
    toggleUser,
  } = usePaginatedUsers();

  const isDraft = useRef<boolean>(true);

  // When selectedUsers are changed, initiate a channel with those users as members,
  // and set it as a channel on current screen.
  useEffect(() => {
    const initChannel = async () => {
      if (!chatClient?.user?.id || !selectedUsers) return;

      // If there are no selected usres, then set dummy channel.
      if (selectedUsers.length === 0) {
        setUpdate(u => u + 1);
        return;
      }

      let members = [chatClient.user.id];

      members = members.concat(selectedUsers.map((t) => t.id));
      // Check if the channel already exists.
      const channels = await chatClient.queryChannels({
        members,
        distinct: true,
      });

      if (channels.length === 1) {
        // Channel already exist
        currentChannel.current = channels[0];
        isDraft.current = false;
        messageInputRef.current?.focus();
      } else {
        // Channel doesn't exist.
        isDraft.current = true;

        const channel = chatClient.channel('messaging', {
          members,
        });

        // Hack to trick channel component into accepting channel without watching it.
        channel.initialized = true;
        currentChannel.current = channel;
        messageInputRef.current?.focus();
      }

      setUpdate((u) => u + 1);
    };

    initChannel();
  }, [selectedUsers]);

  /**
   * 1. If the current channel is draft, then we create the channel and then send message
   * Otherwise we simply send the message.
   *
   * 2. And then navigate to ChannelScreen
   */
  const customSendMessage = async () => {
    if (!currentChannel?.current) return;

    if (isDraft.current) {
      currentChannel.current.initialized = false;
      await currentChannel.current.query({});
    }

    try {
      await currentChannel.current.sendMessage({
        text: messageInputText.current,
      });

      navigation.replace('ChannelScreen', {
        channelId: currentChannel.current.id,
      });
    } catch (e) {
      Alert.alert('Error sending a message');
    }
  };

  const grow = {
    flexGrow: 1,
    flexShrink: 1,
  };

  const renderContent = () => (
    <>
      <ScreenHeader title={'New Chat'} />
      <View
        style={{
          paddingTop: 15,
          width: '100%',
          ...grow,
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            searchInputRef.current?.focus?.();
            setFocusOnSearchInput(true);
          }}
          style={[
            styles.searchContainer,
            {
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <View style={styles.searchContainerLeft}>
            <Text
              style={[
                {
                  color: colors.text,
                },
              ]}
            >
              To:
            </Text>
          </View>
          <View style={styles.searchContainerMiddle}>
            <View style={styles.selectedusersContainer}>
              {selectedUsers.map((tag, index) => {
                const tagProps = {
                  index,
                  onPress: () => {
                    toggleUser && toggleUser(tag);
                  },
                  disabled: !focusOnSearchInput,
                  tag,
                };

                return <SelectedUserTag key={index} {...tagProps} />;
              })}
            </View>
            <View
              style={[
                styles.inputBoxContainer,
                {
                  display: focusOnSearchInput ? 'flex' : 'none',
                },
              ]}
            >
              <TextInput
                onChangeText={onChangeSearchText}
                onFocus={onFocusInput}
                placeholder={'Type a name'}
                placeholderTextColor={colors.textLight}
                ref={(ref) => {
                  if (!ref) return;

                  // @ts-ignore
                  searchInputRef.current = ref;
                }}
                style={[
                  styles.inputBox,
                  {
                    color: colors.text,
                  },
                ]}
                value={searchText}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.searchContainerRight}>
            {selectedUsers.length === 0 ? (
              <User height={32} width={32} />
            ) : (
              <AddUser height={32} width={32} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
        {focusOnSearchInput && !searchText && (
          <>
            {selectedUsers.length === 0 && (
              <TouchableOpacity
                onPress={() => {
                  navigation.replace('NewGroupChannelAddMemberScreen');
                }}
                style={styles.createGroupButtonContainer}
              >
                <RoundButton>
                  <Contacts fill={'#006CFF'} height={25} width={25} />
                </RoundButton>
                <Text
                  style={[
                    styles.createGroupButtonText,
                    {
                      color: colors.text,
                    },
                  ]}
                >
                  Create a Group
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {results && results.length >= 0 && focusOnSearchInput && (
          <UserSearchResults
            loading={loadingResults}
            loadMore={loadMore}
            results={results}
            searchText={searchText}
            selectedUserIds={selectedUserIds}
            toggleSelectedUser={(user) => {
              setFocusOnMessageInput(true);
              setFocusOnSearchInput(false);
              toggleUser(user);
            }}
          />
        )}
      </View>
    </>
  );
  if (!chatClient) return null;

  if (!currentChannel.current) return renderContent();

  return (
    <View style={{ flex: 1 }}>
      <Channel
        additionalTextInputProps={{
          onFocus: () => {
            setFocusOnMessageInput(true);
          },
        }}
        channel={currentChannel.current}
        EmptyStateIndicator={EmptyMessagesIndicator}
        enforceUniqueReaction
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -300}
        onChangeText={(text) => {
          messageInputText.current = text;
        }}
        SendButton={(props) => (
          <SendMessageButton {...props} sendMessage={customSendMessage} />
        )}
        setInputRef={(ref) => {
          // @ts-ignore
          messageInputRef.current = ref;
        }}
      >
        {renderContent()}
        {results && results.length >= 0 && !focusOnSearchInput && (
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
            }}
          >
            <View style={styles.grow}>
              {focusOnMessageInput && <MessageList />}
            </View>
            {selectedUsers.length > 0 && <MessageInput />}
          </View>
        )}
      </Channel>
    </View>
  );
};

const EmptyMessagesIndicator = () => {
  const { colors } = useTheme() as AppTheme;
  return (
    <View
      style={{
        flexGrow: 1,
        flexShrink: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: colors.text,
        }}
      >
        No chats here yet
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  grow: {
    flexGrow: 1,
    flexShrink: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
  },
  searchContainer: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  searchContainerLeft: {
    fontSize: 15,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
  },
  searchContainerMiddle: {
    flexGrow: 1,
    flexShrink: 1,
    paddingBottom: 16,
  },
  searchContainerRight: {
    alignSelf: 'flex-end',
    paddingBottom: 16,
  },
  selectedusersContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  inputBoxContainer: {
    flexDirection: 'row',
    margin: 4,
    width: '100%',
  },
  inputBox: {
    marginRight: 2,
    padding: 0,
  },

  createGroupButtonContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingBottom: 15,
    paddingLeft: 10,
    paddingTop: 15,
  },
  createGroupButtonText: {
    fontWeight: 'bold',
    marginLeft: 8,
  },
  searchResultsLableContainer: {
    padding: 5,
    paddingLeft: 8,
  },
});