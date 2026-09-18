// src/screens/Board/ReportBoard.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, TextInput, Platform
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../../api/apiClient';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

const TABS = [
  { key: 'reports', label: '신고 내역', icon: 'report' },
  { key: 'malicious', label: '악성 URL 목록', icon: 'block' },
];

const PAGE_SIZE = 20;

export default function ReportBoard({navigation}) {
  const { palette, baseFont } = useSettings();
  const dyn = useMemo(() => ({
    bg:   { backgroundColor: palette.bg },
    card: { backgroundColor: palette.card, borderColor: palette.border },
    text: { color: palette.text, fontSize: baseFont },
    sub:  { color: palette.sub, fontSize: Math.max(12, baseFont - 2) },
    input:{ color: palette.text, borderColor: palette.border, backgroundColor: palette.card },
    tabActive: { backgroundColor: palette.text },
  }), [palette, baseFont]);
  
  const [tab, setTab] = useState('reports');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');

  const [state, setState] = useState({
    reports: { items: [], page: 1, hasMore: true },
    malicious: { items: [], page: 1, hasMore: true },
  });

  const active = state[tab];

  const [isInitialAuthLoading, setIsInitialAuthLoading] = useState(true); 

  const [userStatus, setUserStatus] = useState({
      isLoggedIn: false, 
      role: null, 
  }); 
  
  const isAdmin = userStatus.role === 'ADMIN';
  const isUserLoggedIn = userStatus.isLoggedIn; 

  useEffect(() => {
      const fetchStatus = async () => {
          try {
              const res = await apiClient.get('/auth/me'); 
              setUserStatus({
                  isLoggedIn: res.data.is_logged_in,
                  role: res.data.role 
              });
          } catch (e) {
              console.error("Failed to fetch user status:", e);
              setUserStatus({ isLoggedIn: false, role: null });
          }finally {
              setIsInitialAuthLoading(false); 
          }
      };
      fetchStatus();
  }, []);

  const fetchList = useCallback(async (which, page = 1, merge = false) => {
    setError('');
    setLoading(true);
    try {
      
      const url = which === 'reports' ? '/board/reports' : '/board/malicious';
      const res = await apiClient.get(url, {
        params: { page, size: PAGE_SIZE, q: query || undefined, format: 'json' },
      });

      const rows = Array.isArray(res?.data?.items) ? res.data.items : [];
      // ✅ [추가] 서버에서 받은 데이터를 콘솔에 출력합니다.
      console.log(`[DEBUG] Received ${which} rows:`, rows.length, rows[0]);
      const hasMore = rows.length === PAGE_SIZE;

      setState(prev => {
        const prevItems = merge ? prev[which].items : [];
        return {
          ...prev,
          [which]: {
            items: merge ? prevItems.concat(rows) : rows,
            page,
            hasMore,
          },
        };
      });
    } catch (e) {
      console.error(e);
      setError('목록을 불러오지 못했습니다.');
      setState(prev => ({ 
        ...prev, 
        [which]: { ...prev[which], hasMore: false } 
      }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    fetchList(tab, 1, false);
  }, [tab, fetchList]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchList(tab, 1, false);
  }, [tab, fetchList]);

  const loadMore = useCallback(() => {
    if (loading || !active.hasMore) return;
    fetchList(tab, active.page + 1, true);
  }, [loading, active, tab, fetchList]);

  const Header = useMemo(() => (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={28} color={dyn.text.color}/>
          </TouchableOpacity>
        </View>
        <View style={styles.headerTextContainer}>
          <CustomText style={[styles.title, dyn.text]}>QR 코드 신고 게시판</CustomText>
          <CustomText style={[dyn.sub, styles.subtitle]}>의심 URL 신고 및 검증된 악성 URL 열람</CustomText> 
        </View>

        {isUserLoggedIn && ( 
            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => {
                const parentNav = navigation.getParent();
                if (parentNav) {
                  parentNav.navigate('ReportScreen');
                } else {
                  console.log("getParent 실패 , push 시도");
                  navigation.push('ReportScreen')
                }
              }}
              activeOpacity={0.8}
            >
              <Icon name="campaign" size={16} color="#ffffff" style={styles.reportIcon} />
                <CustomText style={[styles.reportButtonText, { fontSize: Math.max(12, baseFont) }]}>신고하기</CustomText>
                </TouchableOpacity>
              )}
        </View>

      <View style={styles.tabs}>
        {TABS.map(t => {
          const activeTab = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, activeTab && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.9}
            >
              <Icon
                name={t.icon}
                size={16}
                color={activeTab ? '#fff' : '#6b7280'}
                style={{ marginRight: 6 }}
              />
              <CustomText style={[styles.tabText, activeTab && styles.tabTextActive]}>
                {t.label}
              </CustomText>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.searchRow, dyn.card]}>
        <Icon name="search" size={20} color="#6b7280" />
        <TextInput
          placeholder="URL, 도메인, 비고로 검색"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => fetchList(tab, 1, false)}
          style={[styles.searchInput, dyn.input]}
          returnKeyType="search"
          placeholderTextColor={dyn.sub.color} 
        />
        {query?.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); }}>
            <Icon name="close" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  ), [navigation, tab, query, fetchList, dyn, isUserLoggedIn]); // 여기에 isUserLoggedIn을 추가합니다.


  const renderItem = ({ item }) => {
    const isReport = tab === 'reports';

    const isClickable = isReport && isAdmin; 
    
    const url = item.url || '';
    const domain = item.domain || '';
    const metaLeft = isReport ? '' : (item.source || '검증');
    const metaRight = isReport ? (item.status || '확인중') : (item.severity || item.score || '');
    const date = (isReport ? item.created_at : item.detected_at) || '';
    return (
      <TouchableOpacity
        style={[styles.card, dyn.card]}
        onPress={() => {
          if (isClickable) {
            navigation.navigate('ReportDetailScreen', { reportId: item.id, url: item.url });
          }
        }}
        disabled={!isClickable} // 클릭 불가능하면 disabled 처리
        activeOpacity={isClickable ? 0.8 : 1}>
        <View style={styles.cardTopRow}>
          <CustomText numberOfLines={1} style={[styles.urlText, dyn.text]}>{url}</CustomText>
          <Chip type={isReport ? (item.status || '확인중') : '악성'} baseFont={baseFont} />
        </View>
        <CustomText numberOfLines={1} style={[styles.domainText, dyn.sub]}>{domain}</CustomText>
        {isReport && !!item.reason && (
          <CustomText numberOfLines={2} style={[styles.reasonText, dyn.sub]}>사유: {item.reason}</CustomText>
        )}
        <View style={styles.cardMetaRow}>
          <CustomText style={[styles.metaLeft, dyn.sub]}>{metaLeft}</CustomText>
          <CustomText style={[styles.metaRight, dyn.sub]}>{date}</CustomText>
        </View>
      </TouchableOpacity>
    );
  };
  if (isInitialAuthLoading) { 
    return (
      <SafeAreaView style={[styles.safe, dyn.bg]}>
        <ActivityIndicator size="large" color={palette.text} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}/>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, dyn.bg]}>
      <FlatList
        data={active.items}
        keyExtractor={(it, idx) => String(it.id ?? `${tab}-${idx}`)}
        ListHeaderComponent={Header}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={
          loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator size="small" color="#2c67ff" />
            </View>
          ) : !active.hasMore ? (
            <CustomText style={styles.endText}>마지막입니다</CustomText>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Chip({ type, baseFont }) {
  const txt = String(type);
  const isPending = /확인|대기|pending/i.test(txt);
  const isApproved = /정상|legitimate|승인|채택|approve|확정|검증됨/i.test(txt);
  const isMalicious = /악성|malicious|거절|reject/i.test(txt);
  const bg = isApproved ? '#DCFCE7' : isMalicious ? '#FEE2E2' : '#FEF9C3'; 
  const color = isApproved ? '#166534' : isMalicious ? '#991B1B' : '#92400E';
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <CustomText style={[styles.chipText, { color, fontSize: Math.max(11, baseFont - 3) }]}>{txt}</CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { paddingTop: 8, paddingBottom: 12 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTextContainer: { flex: 1, marginHorizontal: 10, },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize : 13, },
  reportButton: {
    backgroundColor: '#2c67ff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row', 
    alignItems: 'center',
  },  
  reportIcon: {  marginRight: 6,  },
  reportButtonText: { color: '#ffffff', fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: '#F3F4F6',
  },
  tabBtnActive: { backgroundColor: '#111827' },
  tabText: { color: '#6b7280', fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  searchRow: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: Platform.OS === 'ios' ? 6 : 0 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  urlText: { flex: 1, fontWeight: '700', color: '#111827', marginRight: 8 },
  domainText: { marginTop: 2, color: '#374151' },
  reasonText: { marginTop: 6, color: '#4b5563' },
  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  chipText: { fontWeight: '800' },
  cardMetaRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  metaLeft: { color: '#6b7280' },
  metaRight: { color: '#6b7280' },
  errorText: { position: 'absolute', left: 16, right: 16, bottom: 16, color: '#b42318' },
  endText: { textAlign: 'center', color: '#6b7280', paddingVertical: 12, fontSize: 12 },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#f9fafb',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
});
