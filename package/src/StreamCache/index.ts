import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import StreamMediaCache from '../StreamMediaCache';

import type {
  Channel,
  ChannelFilters,
  ChannelSort,
  ChannelStateAndDataInput,
  ChannelStateAndDataOutput,
  ClientStateAndData,
  OwnUserResponse,
  StreamChat,
  TokenOrProvider,
  UserResponse,
} from 'stream-chat';

import type {
  DefaultAttachmentType,
  DefaultChannelType,
  DefaultCommandType,
  DefaultEventType,
  DefaultMessageType,
  DefaultReactionType,
  DefaultUserType,
  UnknownType,
} from '../types/types';

import {
  CURRENT_CLIENT_VERSION,
  CURRENT_SDK_VERSION,
  STREAM_CHAT_CHANNELS_DATA,
  STREAM_CHAT_CHANNELS_ORDER,
  STREAM_CHAT_CLIENT_DATA,
  STREAM_CHAT_CLIENT_VERSION,
  STREAM_CHAT_SDK_VERSION,
} from './constants';

// { [index: filter_sort_string]: { [index: channelId]: position_in_list } }
export type ChannelsOrder = { [index: string]: { [index: string]: number } };
type STREAM_CHAT_CHANNEL_DATA_KEY = `STREAM_CHAT_CHANNEL_DATA_${string}`;
export type CacheKey =
  | typeof STREAM_CHAT_CLIENT_DATA
  | STREAM_CHAT_CHANNEL_DATA_KEY
  | typeof STREAM_CHAT_CHANNELS_DATA
  | typeof STREAM_CHAT_SDK_VERSION
  | typeof STREAM_CHAT_CLIENT_VERSION
  | typeof STREAM_CHAT_CHANNELS_ORDER;

type CacheValuesDefault<
  Ch extends UnknownType = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Us extends UnknownType = DefaultUserType,
  > = {
    STREAM_CHAT_CHANNELS_ORDER: ChannelsOrder;
    STREAM_CHAT_CLIENT_DATA: ClientStateAndData<Ch, Co, Us>;
    STREAM_CHAT_CLIENT_VERSION: string;
    STREAM_CHAT_SDK_VERSION: string;
  };

type CacheValues<
  At extends UnknownType = DefaultAttachmentType,
  Ch extends UnknownType = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Me extends UnknownType = DefaultMessageType,
  Re extends UnknownType = DefaultReactionType,
  Us extends UnknownType = DefaultUserType,
  > = {
    get: CacheValuesDefault<Ch, Co, Us> & {
      STREAM_CHAT_CHANNELS_DATA: string[];
    } & { [index: string]: ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us> };
    set: CacheValuesDefault<Ch, Co, Us> & {
      STREAM_CHAT_CHANNELS_DATA: string[];
    } & { [index: string]: ChannelStateAndDataOutput<At, Ch, Co, Me, Re, Us> };
  };

export type CacheInterface<
  At extends UnknownType = DefaultAttachmentType,
  Ch extends UnknownType = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Me extends UnknownType = DefaultMessageType,
  Re extends UnknownType = DefaultReactionType,
  Us extends UnknownType = DefaultUserType,
  > = {
    getItem: <Key extends CacheKey>(
      key: Key,
    ) => Promise<CacheValues<At, Ch, Co, Me, Re, Us>['get'][Key] | null>;
    removeItem: <Key extends CacheKey>(key: Key) => Promise<void>;
    setItem: <Key extends CacheKey>(
      key: Key,
      value: CacheValues<At, Ch, Co, Me, Re, Us>['set'][Key] | null,
    ) => Promise<void>;
  };

function extractChannelMessagesMap<
  At extends UnknownType = DefaultAttachmentType,
  Ch extends UnknownType = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Me extends UnknownType = DefaultMessageType,
  Re extends UnknownType = DefaultReactionType,
  Us extends UnknownType = DefaultUserType,
  >(channelsData: ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[] | null): { [cid: string]: { [mid: string]: true; }; } {
  const oldChannelsMessagesMap =
    // for each channel...
    (channelsData || []).reduce((curr, next) => {
      if (next.id) {
        // create a map where key is channel id
        curr[next.id] = {};
        // iterate through messages of that channel
        next.state.messages.forEach((message) => {
          // create an entry in that map, inside of channels key to store that message
          // this is how we extract all the messages that are currently available
          // in a specific array of channels
          curr[next.id as string][message.id] = true;
        });

        // Then we do the same for threads
        Object.values(next.state.threads).forEach((thread) =>
          thread.forEach((threadMessage) => {
            curr[next.id as string][threadMessage.id] = true;
          }),
        );
      }
      return curr;
    }, {} as { [cid: string]: { [mid: string]: true } }) || {};

  return oldChannelsMessagesMap;
}

type ChannelSortOrder<C> = {
  [index: string]: C;
};

export class StreamCache<
  At extends UnknownType = DefaultAttachmentType,
  Ch extends UnknownType = DefaultChannelType,
  Co extends string = DefaultCommandType,
  Ev extends UnknownType = DefaultEventType,
  Me extends UnknownType = DefaultMessageType,
  Re extends UnknownType = DefaultReactionType,
  Us extends UnknownType = DefaultUserType,
  > {
  public currentNetworkState: boolean | null;
  private static instance: StreamCache;
  private static cacheMedia: boolean;
  private client: StreamChat<At, Ch, Co, Ev, Me, Re, Us>;
  private cacheInterface: CacheInterface<At, Ch, Co, Me, Re, Us>;
  private cachedChannelsOrder: ChannelsOrder;
  private orderedChannels: { [index: string]: Channel<At, Ch, Co, Ev, Me, Re, Us>[] };
  private tokenOrProvider: TokenOrProvider;

  /**
   * The Singleton's constructor should always be private to prevent direct
   * construction calls with the `new` operator.
   */
  private constructor(
    client: StreamChat<At, Ch, Co, Ev, Me, Re, Us>,
    cacheInterface: CacheInterface<At, Ch, Co, Me, Re, Us>,
    tokenOrProvider: TokenOrProvider,
  ) {
    this.client = client;
    this.cacheInterface = cacheInterface;
    this.currentNetworkState = null;
    this.cachedChannelsOrder = {};
    this.orderedChannels = {};
    this.tokenOrProvider = tokenOrProvider;

    this.startWatchers();
  }

  /**
   * The static method that controls the access to the singleton instance.
   *
   * This implementation let you subclass the Singleton class while keeping
   * just one instance of each subclass around.
   */
  public static getInstance<
    At extends UnknownType = DefaultAttachmentType,
    Ch extends UnknownType = DefaultChannelType,
    Co extends string = DefaultCommandType,
    Ev extends UnknownType = DefaultEventType,
    Me extends UnknownType = DefaultMessageType,
    Re extends UnknownType = DefaultReactionType,
    Us extends UnknownType = DefaultUserType,
    >(
      client?: StreamChat<At, Ch, Co, Ev, Me, Re, Us>,
      cacheInterface?: CacheInterface<At, Ch, Co, Me, Re, Us>,
      tokenOrProvider?: TokenOrProvider,
      cacheMedia = true,
  ): StreamCache<At, Ch, Co, Ev, Me, Re, Us> {
    if (!StreamCache.instance) {
      if (!(client && cacheInterface)) {
        throw new Error('StreamCache should be initialized with client and cacheInterface params');
      }
      StreamCache.instance = new StreamCache(
        client,
        cacheInterface,
        tokenOrProvider,
      ) as unknown as StreamCache;

      StreamCache.cacheMedia = cacheMedia;
    }

    return StreamCache.instance as unknown as StreamCache<At, Ch, Co, Ev, Me, Re, Us>;
  }

  public static hasInstance(): boolean {
    return !!StreamCache.instance;
  }

  public static shouldCacheMedia(): boolean {
    return !!StreamCache.instance && StreamCache.cacheMedia;
  }

  // We normalize channels data to avoid overflowing the row in storage
  private setNormalizedChannelsData(
    channelsData: ChannelStateAndDataOutput<At, Ch, Co, Me, Re, Us>[],
  ) {
    const filteredChannelsData = channelsData.filter((channelData) => channelData.id);
    const channelsDataIds = filteredChannelsData.map((channelData) => channelData.id as string);
    return [
      this.cacheInterface.setItem(STREAM_CHAT_CHANNELS_DATA, channelsDataIds),
      Promise.all(
        filteredChannelsData.map((channelData) =>
          this.cacheInterface.setItem(`STREAM_CHAT_CHANNEL_DATA_${channelData.id}` as CacheKey, channelData),
        ),
      ),
    ] as const;
  }

  private async getNormalizedChannelsData(): Promise<ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[]> {
    const channelsDataIds = await this.cacheInterface.getItem(STREAM_CHAT_CHANNELS_DATA);

    if (!channelsDataIds) return [];

    return Promise.all(
      channelsDataIds.map(
        (channelId) =>
          this.cacheInterface.getItem(`STREAM_CHAT_CHANNEL_DATA_${channelId}` as CacheKey) as Promise<
            ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>
          >,
      ),
    );
  }

  private syncCache() {
    if (this.client.userID) {
      const { channels: currentChannelsData, client: currentClientData } =
        this.client.getStateData();

      return Promise.all([
        this.cacheInterface.setItem(STREAM_CHAT_SDK_VERSION, CURRENT_SDK_VERSION),
        this.cacheInterface.setItem(STREAM_CHAT_CLIENT_VERSION, CURRENT_CLIENT_VERSION),
        this.cacheInterface.setItem(STREAM_CHAT_CLIENT_DATA, currentClientData),
        this.cacheInterface.setItem(STREAM_CHAT_CHANNELS_ORDER, this.cachedChannelsOrder),
        ...this.setNormalizedChannelsData(currentChannelsData),
      ]);
    }

    return Promise.resolve(null);
  }

  private startWatchers() {
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState.match(/inactive|background/)) {
        this.syncCache();
      }
    });

    NetInfo.addEventListener((state) => {
      if (state.isInternetReachable !== null && this.currentNetworkState === null) {
        this.currentNetworkState = state.isConnected && state.isInternetReachable;
        return;
      }

      if (state.isConnected && state.isInternetReachable && !this.currentNetworkState) {
        this.client.openConnection();
        this.currentNetworkState = true;
      } else if ((!state.isConnected || !state.isInternetReachable) && this.currentNetworkState) {
        this.currentNetworkState = false;
      }
    });
  }

  private reinitializeAuthState(clientData: ClientStateAndData<Ch, Co, Us>): Promise<void> {
    const user = {
      id: clientData.user?.id,
      name: clientData.user?.name,
    } as OwnUserResponse<Ch, Co, Us> | UserResponse<Us>;

    return this.client.reInitializeAuthState(user, this.tokenOrProvider);
  }

  private orderChannelsBasedOnCachedOrder<
    C extends
    | Channel<At, Ch, Co, Ev, Me, Re, Us>[]
    | ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[],
    >(channels: C): ChannelSortOrder<C> {
    const channelsOrder = {} as ChannelSortOrder<C>;

     // Get current active channels
      // get order from cache

    // currentChannelsOrderKey = filter_and_sort_string
    // we may have two channel lists with different filter/sort
    Object.keys(this.cachedChannelsOrder).forEach((currentChannelsOrderKey) => {
      const currentChannelsOrder = this.cachedChannelsOrder?.[currentChannelsOrderKey];
      // {[index: channelId]: position of the channel}
      const channelsIndicesMap = (
        channels as ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[]
      ).reduce((curr, next, index) => {
        if (!next.id || !currentChannelsOrder[next.id]) return curr;
        curr[next.id] = index;
        return curr;
      }, {} as { [index: string]: number });

      if (currentChannelsOrder) {
        channels.sort((a: { id: string | number | undefined; }, b: { id: string | number | undefined; }) => {
          // return value > 0, sort b before a
          // return value < 0, sort a before b

          // if they both have undefined ids, sort a before b
          if (a.id === undefined && b.id === undefined) return -1;
          // if only a has undefined id, sort b before a
          if (a.id === undefined) return 1;
          // if only b has undefined id, sort a before b
          if (b.id === undefined) return -1;

          // If both a and b have no previous cached position on currentChannelsOrder,
          // we use the original position from channelsIndicesMap, which is based on the
          // original client channel list
          if (currentChannelsOrder[a.id] === undefined && currentChannelsOrder[b.id] === undefined)
            return channelsIndicesMap[a.id] - channelsIndicesMap[b.id];

          // If only a has no previous cached position, sort b before a
          if (currentChannelsOrder[a.id] === undefined) return 1;
          // If only b has no previous cached position, sort a before b
          if (currentChannelsOrder[b.id] === undefined) return -1;

          // Finally, calculate position based on cached channels order by substracting indices
          return currentChannelsOrder[a.id] - currentChannelsOrder[b.id];
        });
      }

      // Finally we set the ordered channels for that specific filter_and_sort_string key
      // This is a forEach so if you have multiple channel lists, it will do the same thing
      // for each list
      channelsOrder[currentChannelsOrderKey] = (
        channels as ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[]
      ).filter((c) => c.id && currentChannelsOrder[c.id] !== undefined) as C;
    });
    return channelsOrder;
  }

  private async hasNewVersion() {
    const sdkCachedVersion = await this.cacheInterface.getItem(STREAM_CHAT_SDK_VERSION);
    const clientCachedVersion = await this.cacheInterface.getItem(STREAM_CHAT_CLIENT_VERSION);

    const sdkVersionChanged = sdkCachedVersion !== CURRENT_SDK_VERSION;
    const clientVersionChanged = clientCachedVersion !== CURRENT_CLIENT_VERSION;

    // This avoids problems if (accross versions) anything changes in the format of the cached data
    const versionChanged = !!(sdkVersionChanged || clientVersionChanged);

    if (versionChanged) {
      console.info('Stream libraries changed version. Cleaning up cache...');
      this.clear();
    }

    return versionChanged;
  }

  public async hasCachedData() {
    const newVersion = await this.hasNewVersion();

    if (newVersion) {
      return false;
    }

    const clientData = await this.cacheInterface.getItem(STREAM_CHAT_CLIENT_DATA);
    const channelsData = await this.getNormalizedChannelsData();

    return !!(clientData && channelsData);
  }

  private async removeOlderImages(
    oldChannelsData: ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[],
    newChannelsData: ChannelStateAndDataInput<At, Ch, Co, Me, Re, Us>[],
  ) {
    const oldChannelsMessagesMap = extractChannelMessagesMap(oldChannelsData);
    const newChannelsMessagesMap = extractChannelMessagesMap(newChannelsData);

    // After having the maps containing each channel and each message/thread available
    // in it with truthy values, we get the difference between those two channels
    // in order to identify which channels/messages got removed.
    // This is how we remove cached media based on when the channel/message is cached.

    const removedChannels: string[] = [];
    const removedMessages: { channelId: string; messageId: string }[] = [];

    // Extract array of ids for removed channels
    Object.keys(oldChannelsMessagesMap).forEach((oldChannelId) => {
      if (!newChannelsMessagesMap[oldChannelId]) {
        removedChannels.push(oldChannelId);
        return;
      }

      // Extract array of ids for removed messages in that channel
      Object.keys(oldChannelsMessagesMap[oldChannelId]).forEach((oldMessageId) => {
        if (!newChannelsMessagesMap[oldChannelId][oldMessageId]) {
          removedMessages.push({ channelId: oldChannelId, messageId: oldMessageId });
        }
      });
    });

    // Use extracted channel ids array for removing Media Cache
    await Promise.all(
      removedChannels.map((channelId) =>
        Promise.all([
          StreamMediaCache.removeChannelAttachments(channelId),
          StreamMediaCache.removeChannelAvatars(channelId),
        ]),
      ),
    );

    // Use extracted message ids array for removing Media Cache
    await Promise.all(
      removedMessages.map(({ channelId, messageId }) =>
        StreamMediaCache.removeMessageAttachments(channelId, messageId),
      ),
    );
  }

  public async syncCacheAndImages(): Promise<void> {
    // When cache is synced, we need to remove images in which their channel/message
    // is no longer cached
    const oldChannelsData = await this.getNormalizedChannelsData();
    if (!oldChannelsData) return;

    await this.syncCache();

    const newChannelsData = await this.getNormalizedChannelsData();

    await this.removeOlderImages(oldChannelsData, newChannelsData || []);
  }

  private async rehydrate(clientData: ClientStateAndData<Ch, Co, Us>): Promise<void> {
    try {
      const channelsData = await this.getNormalizedChannelsData();

      this.cachedChannelsOrder =
        (await this.cacheInterface.getItem(STREAM_CHAT_CHANNELS_ORDER)) || {};

      if (clientData && channelsData) {
        this.client.reInitializeWithState(clientData, channelsData || []);
        this.orderedChannels = this.orderChannelsBasedOnCachedOrder(
          Object.values(this.client.activeChannels),
        );
      }
    } catch (error) {
      console.warn(`Error while rehydrating cache: ${error}`)
      console.warn(`Clearning cache.`)
      this.clear();
    }
  }

  public async initialize({ openConnection = true } = {}): Promise<void> {
    try {
      const clientData = await this.cacheInterface.getItem(STREAM_CHAT_CLIENT_DATA);
      if (clientData) {
        await this.reinitializeAuthState(clientData);
        await this.rehydrate(clientData);
        // If users want to manually control the socket connection when offline, just send this parameter as false
        if (openConnection) {
          // Awaiting this may take some time specially when user is offline cause it retries 3 times
          this.client.openConnection();
        }
      }
    } catch (error) {
      console.warn(`Error while initializing cache: ${error}`)
    }
  }

  private getChannelsOrderKey({ filters, sort }: { filters: ChannelFilters<Ch, Co, Us>; sort: ChannelSort<Ch>; }): string {
    return `${JSON.stringify(filters)}_${JSON.stringify(sort)}`;
  }

  public getOrderedChannels({ filters, sort }: { filters: ChannelFilters<Ch, Co, Us>; sort: ChannelSort<Ch>; }): Channel<At, Ch, Co, Ev, Me, Re, Us>[] {
    return this.orderedChannels[this.getChannelsOrderKey({ filters, sort })] || [];
  }

  public syncChannelsCachedOrder(
{ channels, filters, sort }: { channels: Channel<At, Ch, Co, Ev, Me, Re, Us>[]; filters: ChannelFilters<Ch, Co, Us>; sort: ChannelSort<Ch>; },
  ): void {
    // We keep track of the channels order on every change so it can be used when
    // in offline mode
    this.cachedChannelsOrder[this.getChannelsOrderKey({ filters, sort })] = channels.reduce(
      (acc, next, index) => {
        if (next.id) {
          acc[next.id] = index;
        }
        return acc;
      },
      {} as { [index: string]: number },
    );
  }

  public async clear(): Promise<void> {
    // We need to get the channelsIds before we execute this.cacheInterface.removeItem(STREAM_CHAT_CHANNELS_DATA).
    const channelsIds = (await this.cacheInterface.getItem(STREAM_CHAT_CHANNELS_DATA)) || [];
    const removeAllChannelsItemsPromise = Promise.all(
      channelsIds.map((channelId) =>
        this.cacheInterface.removeItem(`STREAM_CHAT_CHANNEL_DATA_${channelId}` as CacheKey),
      ),
    );

    await Promise.all([
      this.cacheInterface.removeItem(STREAM_CHAT_SDK_VERSION),
      this.cacheInterface.removeItem(STREAM_CHAT_CLIENT_VERSION),
      this.cacheInterface.removeItem(STREAM_CHAT_CLIENT_DATA),
      this.cacheInterface.removeItem(STREAM_CHAT_CHANNELS_DATA),
      this.cacheInterface.removeItem(STREAM_CHAT_CHANNELS_ORDER),
      removeAllChannelsItemsPromise,
      StreamMediaCache.clear(),
    ]);
  }
}
