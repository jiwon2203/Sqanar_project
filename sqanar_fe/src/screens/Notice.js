import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";

const Notice = ({ navigation }) => {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  // 예시용 더미 데이터 (실제로는 서버에서 fetch)
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        // 실제 API 예시:
        // const response = await fetch("https://your-server.com/api/notices");
        // const data = await response.json();

        // 더미 데이터
        const data = [
          {
            id: "1",
            title: "서비스 점검 안내",
            content: "10월 30일(수) 새벽 2시부터 3시까지 서버 점검이 있습니다.",
            date: "2025-10-25",
          },
          {
            id: "2",
            title: "신규 기능 업데이트!",
            content: "QR 분석 정확도를 개선하고 새로운 UI를 적용했습니다.",
            date: "2025-10-22",
          },
          {
            id: "3",
            title: "공지사항 테스트",
            content: "테스트용 공지사항 내용입니다.",
            date: "2025-10-20",
          },
        ];

        setNotices(data);
      } catch (error) {
        console.error("공지사항 불러오기 실패:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotices();
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.noticeItem}
      onPress={() => navigation.navigate("NoticeDetail", { notice: item })}
    >
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.date}>{item.date}</Text>
      <Text style={styles.contentPreview} numberOfLines={2}>
        {item.content}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📢 공지사항</Text>
      <FlatList
        data={notices}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

export default Notice;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  listContainer: {
    paddingBottom: 20,
  },
  noticeItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
  },
  contentPreview: {
    fontSize: 14,
    color: "#333",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
