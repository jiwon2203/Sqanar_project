import React, { useEffect, useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getScanHistory } from '../../../api/chat';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

export default function QRHistory({ visible, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const { palette, baseFont } = useSettings(); 
  
  const dyn = useMemo(() => ({
    cardBg: { backgroundColor: palette.card, borderColor: palette.border },
    text: { color: palette.text, fontSize: baseFont },
    sub: { color: palette.sub, fontSize: Math.max(12, baseFont - 2) },
  }), [palette, baseFont]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      try {
        const d = await getScanHistory();
        setItems(d?.scans || []);
      } catch (e) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* 반투명 배경 */}
      <TouchableOpacity activeOpacity={1} style={s.backdrop} onPress={onClose}/>
      {/* 카드 */}
      <View style={s.cardWrap}>
        <View style={[s.card, dyn.cardBg]}>
          <View style={s.cardHeader}>
            <CustomText style={s.cardTitle}>검색 기록</CustomText>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={items}
            keyExtractor={(it, idx) => String(it.id ?? idx)}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row} onPress={() => onPick?.(item)}>
                <Icon name="qr-code" size={18} color="#111827" />
                <View style={{ flex: 1 }}>
                  <CustomText style={s.main} numberOfLines={1}>
                    {item.url}
                  </CustomText>
                  <CustomText style={s.sub}>
                    {item.analysis_date || '-'}
                  </CustomText>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={s.sep} />}
            ListEmptyComponent={<CustomText style={s.empty}>{loading ? '불러오는 중…' : '검색 기록이 없습니다.'}</CustomText>}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  cardWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 90,
    alignItems: 'center',
  },
  card: {
    width: 240,
    maxHeight: 300,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 12 },
  main: { fontSize: 13, color: '#111827', fontWeight: '600' },
  sub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  sep: { height: 1, backgroundColor: '#EEF2F7' },
  empty: { padding: 12, textAlign: 'center', color: '#6b7280' },
});
