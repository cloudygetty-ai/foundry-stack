import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config/api';

const ConversationItem = ({ item, onPress }) => {
  const unread = item.unreadCount > 0;
  return (
    <TouchableOpacity style={styles.item} onPress={() => onPress(item)}>
      <View style={styles.avatarWrap}>
        {item.otherUser?.photoUrl ? (
          <Image source={{ uri: item.otherUser.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{item.otherUser?.displayName?.[0] ?? '?'}</Text>
          </View>
        )}
        {item.otherUser?.isOnline && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.name, unread && styles.nameBold]}>{item.otherUser?.displayName}</Text>
          <Text style={styles.time}>{formatTime(item.lastMessage?.createdAt)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.preview, unread && styles.previewBold]} numberOfLines={1}>
            {item.lastMessage?.content ?? 'No messages yet'}
          </Text>
          {unread && <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View>}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
};

const MessagesScreen = ({ navigation }) => {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/messages/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setConversations(data.conversations ?? []);
    } catch (err) {
      console.warn('Error fetching conversations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const onPress = (convo) => {
    navigation.navigate('Chat', {
      userId: convo.otherUser?.id,
      userName: convo.otherUser?.displayName,
      conversationId: convo.id,
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ConversationItem item={item} onPress={onPress} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConversations(); }} tintColor="#6366f1" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>Start a conversation from the Discover tab</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937' },
  item: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  avatarWrap: { position: 'relative', marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#6b7280' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  body: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 16, color: '#1f2937' },
  nameBold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#9ca3af' },
  preview: { fontSize: 14, color: '#9ca3af', flex: 1, marginRight: 8 },
  previewBold: { color: '#374151', fontWeight: '600' },
  badge: { backgroundColor: '#6366f1', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 80 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 8, textAlign: 'center', paddingHorizontal: 32 },
});

export default MessagesScreen;
