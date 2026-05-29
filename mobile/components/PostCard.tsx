
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Heart, ExternalLink, Maximize2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    withSequence
} from 'react-native-reanimated';
import { Page } from './Algorithm';

interface PostCardProps {
    page: Page;
    onLike: () => void;
    onPress: () => void;
    onImagePress: () => void;
    isLiked: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({ 
    page, 
    onLike, 
    onPress, 
    onImagePress,
    isLiked 
}) => {
    const scale = useSharedValue(1);
    const likeScale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const likeAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: likeScale.value }]
    }));

    const handleLike = () => {
        likeScale.value = withSequence(
            withSpring(1.5),
            withSpring(1)
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLike();
    };

    return (
        <Animated.View style={[styles.container, animatedStyle]}>
            <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
                <Text style={styles.title}>{page.title}</Text>
                <Text style={styles.summary} numberOfLines={4}>
                    {page.summary}
                </Text>
                
                {page.image && (
                    <TouchableOpacity 
                        activeOpacity={0.9} 
                        onPress={onImagePress}
                        style={styles.imageContainer}
                    >
                        <Image 
                            source={{ uri: page.image }} 
                            style={styles.image}
                            contentFit="cover"
                            transition={500}
                        />
                        <View style={styles.maximizeIcon}>
                            <Maximize2 size={16} color="white" />
                        </View>
                    </TouchableOpacity>
                )}

                <View style={styles.footer}>
                    <TouchableOpacity 
                        style={styles.iconButton} 
                        onPress={() => onPress()}
                    >
                        <ExternalLink size={20} color="#8899A6" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={styles.iconButton} 
                        onPress={handleLike}
                    >
                        <Animated.View style={likeAnimatedStyle}>
                            <Heart 
                                size={22} 
                                color={isLiked ? '#E0245E' : '#8899A6'} 
                                fill={isLiked ? '#E0245E' : 'transparent'} 
                            />
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#15202B',
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#38444D',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    summary: {
        fontSize: 15,
        color: '#FFFFFF',
        lineHeight: 20,
        marginBottom: 12,
    },
    imageContainer: {
        width: '100%',
        height: 250,
        borderRadius: 16,
        overflow: 'hidden',
        marginVertical: 8,
        backgroundColor: '#000',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    maximizeIcon: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 4,
        borderRadius: 4,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 8,
        gap: 16,
    },
    iconButton: {
        padding: 4,
    }
});
