// // src/screens/Home.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../../api/apiClient';
import { useSettings } from '../state/useSettings'; 
import { Modal } from 'react-native';
import CustomText from '../../CustomText';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Logo = require('../../assets/images/logo2.png');

const HomeScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [nickname, setNickname] = useState('');

  const [menuVisible, setMenuVisible] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [yesterdayCount, setYesterdayCount] = useState(0);
  const [recentReports, setRecentReports] = useState([]);
  const { palette, baseFont } = useSettings(); 

  const dyn = useMemo(() => ({
    screen: {  backgroundColor: palette.bg },
    title:  { color: palette.text, fontSize: Math.max(20, baseFont + 2) },
    text:   { color: palette.text, fontSize: baseFont },
    sub:    { color: palette.sub,  fontSize: Math.max(14, baseFont - 2) },

    fixedDarkText: { color: '#112027', fontSize: baseFont }, // 일반 텍스트 

    cardStats: { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 },
    pillTextSize: { fontSize: Math.max(14, baseFont - 2) },
    pillAltTextSize: { fontSize: Math.max(14, baseFont - 2) },
  }), [palette, baseFont]);

  const fetchHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // const res = await apiClient.get('/home', { params: { format: 'json' } });
      const res = await apiClient.get('/auth/me');
      const d = res?.data || {};
      setIsLoggedIn(!!d.is_logged_in);
      setIsGuest(!!d.is_guest);
      setNickname(d.nickname || '');
      setNickname(d.nickname || (d.is_guest ? '게스트' : ''));

      const statsRes = await apiClient.get('/home', { params: { format: 'json' } });
      const stats = statsRes?.data || {};
      // const tc = Number(d.today_count);
      // const yc = Number(d.yesterday_count);
      const tc = Number(stats.today_count);
      const yc = Number(stats.yesterday_count);
      setTodayCount(Number.isFinite(tc) ? tc : 0);
      setYesterdayCount(Number.isFinite(yc) ? yc : 0);

      const reportRes = await apiClient.get('/board/recent-reports');
      if (reportRes.data.ok) {
        setRecentReports(reportRes.data.items || []);
      }
    } catch (e) {
      console.error(e);
      setError('홈 정보를 불러오지 못했습니다.');
      const token = await AsyncStorage.getItem('access_token');
      if (token && e.response?.status === 401) {
        await AsyncStorage.removeItem('access_token');
        delete apiClient.defaults.headers.common['Authorization'];
        setIsLoggedIn(false);
        setIsGuest(false);
        setNickname('');
        Alert.alert('세션 만료', '로그인이 만료되었습니다. 다시 로그인해주세요.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchHome(); 
    });
    return unsubscribe;
    
  }, [navigation, fetchHome]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHome();
    setRefreshing(false);
  }, [fetchHome]);

  const goLogin = () => navigation.navigate('LoginForm');
  const goRegister = () => navigation.navigate('SignUp');
  const goReportBoard = () => navigation.navigate('ReportBoard');
  const goReportScreen = () => navigation.navigate('ReportScreen');

  const handleLogout = async () => {
    setMenuVisible(false); // 메뉴 닫기
    try {
      const res = await apiClient.post('/auth/logout');
      await AsyncStorage.removeItem('access_token');
      delete apiClient.defaults.headers.common['Authorization'];

      setIsLoggedIn(false);
      setIsGuest(false);
      setNickname('');
      setTodayCount(0); // 통계 정보 초기화는 선택 사항
      setYesterdayCount(0);
      
      // 로그아웃 후 홈 정보 재조회 (자동으로 로그인 상태가 false로 바뀜)
      // await fetchHome(); 
      Alert.alert('로그아웃', '성공적으로 로그아웃되었습니다.');
    } catch (e) {
      // /auth/logout이 리다이렉트를 반환해도 axios는 오류로 처리할 수 있습니다.
      // 2xx 범위가 아닌 상태 코드를 받았을 때도 fetchHome을 호출하여 
      // 현재 세션 상태를 다시 확인하는 것이 안전합니다.
      console.error("Logout failed:", e);
      try {
        await AsyncStorage.removeItem('access_token');
        delete apiClient.defaults.headers.common['Authorization'];
        setIsLoggedIn(false);
        setIsGuest(false);
        setNickname('');
      } catch (storageError) {
        console.error("Failed to clear local storage after logout attempt:", storageError);
      }
      Alert.alert('로그아웃 오류', '로그아웃 중 오류가 발생했습니다. 다시 시도해주세요.');
      // await fetchHome(); 
    }
  };

  const GreetMessage = () => {
    if (isLoggedIn) {
      return (
        <View style={styles.greetContainer}>
          <CustomText style={[styles.greetText, dyn.title]}>
            <CustomText style={{ fontWeight: '700' }}>{nickname || 'User'}</CustomText>님,
          </CustomText>
          <CustomText style={[styles.greetSubText, ]}>
            QR 또는 URL을 스캔하여 안전을 확인하세요!
          </CustomText>
        </View>
      );
    } else {
      return (
        <View style={styles.greetContainer}>
          <TouchableOpacity onPress={goLogin} activeOpacity={0.8} style={styles.loginPrompt}>
            <CustomText style={styles.loginPromptText}>
              <CustomText style={styles.loginLink}>로그인</CustomText>하고
            </CustomText>
            <CustomText style={[styles.loginSubText,]}>
            안전한 스캔 기록을 관리해 볼까요?
          </CustomText>
          </TouchableOpacity>
        </View>
      );
    }
  };
  const StatsCard = () => (
    <View style={[styles.cardStats, styles.statsShadow]}>
      <View style={styles.cardHeader}>
        <Icon name="language" size={20} color="#687FE5" /> 
        <CustomText style={[styles.cardTitleDark]}>사이트 검색 현황</CustomText>
      </View>
      <View style={styles.statsRow}>
        {/* 오늘 */}
        <View style={styles.statBox}>
          <CustomText style={[styles.statLabel, styles.statLabelDark]}>오늘</CustomText>
          <CustomText style={[styles.statValue, styles.statValueDark]}>{todayCount}</CustomText>
        </View>
        <View style={styles.divider} />
        {/* 어제 */}
        <View style={styles.statBox}>
          <CustomText style={[styles.statLabel, styles.statLabelSub]}>어제</CustomText>
          <CustomText style={[styles.statValue, styles.statValueSub]}>{yesterdayCount}</CustomText>
        </View>
      </View>
    </View>
  );
  const ReportBoardCard = () => (
    <View style={styles.reportBoardCard}>
      <TouchableOpacity
        onPress={goReportBoard}
        style={styles.boardHeaderTouchable}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="report" size={24} color="#D93025" />
          <CustomText style={styles.boardTitle}>위험 신고 게시판</CustomText>
        </View>
        <Icon name="chevron-right" size={30} color="#6B7280" />
      </TouchableOpacity>
      
      {/* 최근 신고 내역 */}
      <View style={styles.recentReportsContainer}>
        <CustomText style={styles.recentReportsTitle}>최근 신고 내역</CustomText>
        {recentReports.length > 0 ? (
          // recentReports.map((report, index) => (
          recentReports.slice(0, 3).map((report, index) => (
            <View key={report.id || index} style={styles.reportItem}> 
              <View style={styles.reportItemContent}>
                <CustomText style={styles.reportItemUrl} numberOfLines={1}>
                  {report.url_preview} 
                </CustomText>
                <CustomText style={[
                  styles.reportItemStatus, 
                  report.status === '악성' && styles.statusMalicious,
                  report.status === '정상' && styles.statusLegitimate,
                ]}>
                  [{report.status}]
                </CustomText>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.reportItem}>
             <CustomText style={styles.reportItemText}>최근 신고 내역이 없습니다.</CustomText>
          </View>
        )}
      </View>

      {/* 신고하기 버튼 */}
      <TouchableOpacity
        onPress={isLoggedIn ? goReportScreen : goLogin}
        style={styles.reportButton}
        activeOpacity={0.8}
      >
        <CustomText style={styles.reportButtonText}>신고하기</CustomText>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.mainContainer, dyn.screen]}>
    <ScrollView
      style={[styles.scroll, dyn.screen]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SafeAreaView style={styles.topContainer}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={Logo}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Icon name="menu" size={30} color="#F8FAFC" />
          </TouchableOpacity>
        </View>
        <View style={styles.topBar}>
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : (
            <GreetMessage />
          )}
        </View>
    </SafeAreaView>
    <View style={styles.contentWrapper}>
        {Boolean(error) && <CustomText style={[{ color: '#b42318', marginTop: 10 }, dyn.text]}>{error}</CustomText>}
        
        {!loading && <StatsCard />}

        <ReportBoardCard />
    </View>

  </ScrollView>
  <Modal
    visible={menuVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setMenuVisible(false)}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalBox}>
        <CustomText style={styles.modalTitle}>
          {isLoggedIn ? '로그인 상태' : '로그아웃 상태'}
        </CustomText>
        <View style={styles.modalButtons}>
          {!isLoggedIn ? (
            <>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  setMenuVisible(false);
                  goLogin();
                }}
              >
                <CustomText style={styles.modalBtnText}>로그인</CustomText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  setMenuVisible(false);
                  goRegister();
                }}
              >
                <CustomText style={styles.modalBtnText}>회원가입</CustomText>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.modalBtn}
                onPress={async () => {
                  setMenuVisible(false);
                  await handleLogout();
              }}
            >
              <CustomText style={styles.modalBtnText}>로그아웃</CustomText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#ddd' }]}
            onPress={() => setMenuVisible(false)}
          >
            <CustomText style={[styles.modalBtnText, { color: '#333' }]}>닫기</CustomText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
  </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, },
  topContainer: {  paddingHorizontal: 16, backgroundColor: '#687FE5',  paddingBottom: 30,},
  contentWrapper: { paddingHorizontal: 16, marginTop: -30,  flex: 1, },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: '#687FE5',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {width: 120, height: 50, marginRight: 8, marginLeft: -20 },
  topBar: { width: '100%', marginTop: 20, marginBottom: 10 },
  greetContainer: { paddingHorizontal: 0, marginTop: 5 },
  greetText: { fontSize: 24, fontWeight: '400', color: '#F8FAFC', marginBottom: 2 },
  greetSubText: { fontSize: 20, color: '#F8FAFC8' },
  loginPrompt: { paddingVertical: 5 },
  loginPromptText: { fontSize: 24, color: '#F8FAFC', lineHeight: 22 },
  loginLink: { color: '#fff', fontWeight: 'bold' },
  loginSubText: { fontSize: 20, color: '#F8FAFC', marginTop: 4 },
  cardStats: {
    width: '100%',
    backgroundColor: '#fff', 
    borderRadius: 10,
    padding: 0,
    marginTop: 0,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitleDark: { fontSize: 15, fontWeight: '600', color: '#101828' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 0,
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6', 
  },
  statBox: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 0 }, // 연한 구분선
  statLabel: { fontSize: 15, color: '#6b7280', fontWeight: '500' }, // 어제 레이블과 동일하게 조정
  statValue: { marginTop: 4, fontSize: 32, fontWeight: '700', color: '#101828' }, // 값 글꼴 크기/두께 조정
  statLabelDark: { color: '#101828', fontWeight: '600' },
  statValueDark: { fontSize: 32, color: '#101828', fontWeight: '700' },
  statLabelSub: { color: '#6b7280', fontWeight: '500' },
  statValueSub: { fontSize: 28, color: '#6b7280', fontWeight: '700' },
  reportBoardCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 24,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  boardHeaderTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6'
  },
  boardTitle: { fontSize: 18, fontWeight: '700', color: '#101828' },
  recentReportsContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  recentReportsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  reportItemText: { fontSize: 16, color: '#4b5563', },
  reportButton: {
    backgroundColor: '#fdecec',
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f3f4f6',
    width: '50%',
    alignSelf: 'center',
    borderRadius: 10,
    marginBottom: 16,
    marginTop: 16,
    marginTop: 8,
  },
  reportButtonText: { fontSize: 17, fontWeight: '700', color: '#D93025', },
  reportItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
  },
  reportItemUrl: { flex: 1, fontSize: 16, color: '#4b5563', },
  reportItemStatus: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  statusMalicious: { color: '#ff0000', },
  statusLegitimate: { color: '#10b981', },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#111' },
  modalButtons: { width: '100%' },
  modalBtn: {
    width: '80%',
    paddingVertical: 10,
    marginVertical: 6,
    backgroundColor: '#687FE5',
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  authRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  authBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  centerBox: { width: '100%', alignItems: 'center', paddingVertical: 12 },
});

export default HomeScreen;
