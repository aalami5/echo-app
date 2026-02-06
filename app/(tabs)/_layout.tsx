import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet, View, Platform } from 'react-native';
import { colors } from '../../src/constants/theme';

function TabBarIcon({ 
  name, 
  color, 
  focused 
}: { 
  name: React.ComponentProps<typeof Ionicons>['name']; 
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          )
        ),
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon 
              name={focused ? 'chatbubble' : 'chatbubble-outline'} 
              color={color} 
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon 
              name={focused ? 'calendar' : 'calendar-outline'} 
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon 
              name={focused ? 'people' : 'people-outline'} 
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon 
              name={focused ? 'settings' : 'settings-outline'} 
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      {/* Hide unused template screens */}
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    height: Platform.OS === 'ios' ? 85 : 65,
    paddingTop: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  iconContainer: {
    padding: 4,
    borderRadius: 12,
  },
  iconContainerFocused: {
    backgroundColor: colors.primarySubtle,
  },
});
