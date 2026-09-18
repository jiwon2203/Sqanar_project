import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient from '../../api/apiClient';
import { useSettings } from '../state/useSettings';
import CustomText from '../../CustomText';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'legit', label: '정상' },
  { key: 'malicious', label: '악성' },
];

const HistoryScreen = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scans, setScans] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchHistory = async (filt = 'all') => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/history/', {
        params: { format: 'json', filter: filt },
      });
      setScans(res.data.scans || []);
      setIsLoggedIn(res.data.is_logged_in);
      setFilter(res.data.current_filter || filt);
    } catch (err) {
      console.error(err);
      setError('히스토리 불러오기 실패');
    } finally {
      setLoading(false);
    }
  };
  const { palette, baseFont } = useSettings();
  const dyn = {
    bg:   { backgroundColor: palette.bg },
    card: { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 },
    text: { color: palette.text, fontSize: baseFont },
    sub:  { color: palette.sub,  fontSize: Math.max(12, baseFont - 2) },
    chip: { borderColor: palette.text },
  };

  useEffect(() => {
    fetchHistory(filter);
  }, [filter]);
  
  const renderBadge = (label) => {
    const l = (label || '').toUpperCase();
    const badgeFontSize = { fontSize: Math.max(11, baseFont - 3) };

    if (['LEGITIMATE', 'SAFE', '정상'].includes(l)) return <CustomText style={[styles.badge, styles.safe]}>정상</CustomText>;
    if (['MALICIOUS', 'DANGER', '악성'].includes(l)) return <CustomText style={[styles.badge, styles.bad]}>악성</CustomText>;
    if (['CAUTION', '주의'].includes(l)) return <CustomText style={[styles.badge, styles.warn]}>주의</CustomText>;
    return <CustomText style={styles.badge}>기타</CustomText>;
  };

  return (
    <SafeAreaView style={[styles.container, dyn.bg]}>
      <CustomText style={[styles.title, dyn.text]}>히스토리</CustomText>

      {/* 필터 버튼 */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterActive]}
            onPress={() => fetchHistory(f.key)}
          >
            <CustomText style={[styles.filterText, filter === f.key && { color: '#fff' }]}>{f.label}</CustomText>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator size="large" color="#687FE5" />}
      {error !== '' && <CustomText style={styles.error}>{error}</CustomText>}

      {!loading && !error && (
        <FlatList
          data={scans}
          keyExtractor={(item, idx) => item.id?.toString() || idx.toString()}
          renderItem={({ item }) => (
            <View style={[styles.item, dyn.card]}>
              <View style={{ flex: 1 }}>
                <CustomText style={[styles.url, dyn.text]}>
                  {item.url}
                </CustomText>
                <CustomText style={[styles.meta, dyn.sub]}>{item.analysis_date || '-'}</CustomText> 
              </View>
              {renderBadge(item.label)}
            </View>
          )}
          ListEmptyComponent={<CustomText style={styles.empty}>기록이 없습니다.</CustomText>}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#ffffff' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  filterRow: { flexDirection: 'row', marginBottom: 12 },
  filterBtn: {
    borderWidth: 1,
    borderColor: '#687FE5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  filterActive: { backgroundColor: '#687FE5' },
  filterText: { color: '#687FE5', fontWeight: '500' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e3e5e8',
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  url: { fontWeight: '600', color: '#101828' },
  meta: { color: '#667085', marginTop: 4 },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, overflow: 'hidden' }, 
  safe: { backgroundColor: '#ecfdf3', color: '#067647' },
  bad: { backgroundColor: '#fef3f2', color: '#b42318' },
  warn: { backgroundColor: '#fff7ed', color: '#b45309' },
  empty: { textAlign: 'center', marginTop: 20, color: '#667085' },
  error: { color: 'red', marginVertical: 10 },
});

export default HistoryScreen;
