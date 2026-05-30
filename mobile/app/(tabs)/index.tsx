
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    View, 
    FlatList, 
    StyleSheet, 
    ActivityIndicator, 
    Text, 
    Modal, 
    TouchableOpacity,
    Linking,
    Platform
} from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { XikipediaAlgorithm, Page } from '../../components/Algorithm';
import { PostCard } from '../../components/PostCard';
import { StartScreen } from '../../components/StartScreen';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';

export default function FeedScreen() {
    const [algorithm, setAlgorithm] = useState<XikipediaAlgorithm | null>(null);
    const [posts, setPosts] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [showStart, setShowStart] = useState(false);

    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        const init = async () => {
            try {
                setLoadingProgress(10);
                const asset = Asset.fromModule(require('../../assets/xikipedia.db'));
                await asset.downloadAsync();
                setLoadingProgress(30);

                let db: SQLite.SQLiteDatabase;
                
                if (Platform.OS !== 'web') {
                    const dbDir = new Directory(Paths.document, 'SQLite');
                    if (!dbDir.exists) {
                        dbDir.create({ intermediates: true, idempotent: true });
                    }
                    
                    const dbFile = new File(dbDir, 'xikipedia.db');
                    const assetFile = new File(asset.localUri!);
                    
                    // Only copy if it doesn't exist to preserve local state, 
                    // though for this specific app we might want to update it.
                    // But if we overwrite every time, we lose nothing since DB is static Wikipedia.
                    await assetFile.copy(dbFile, { overwrite: true });
                    
                    setLoadingProgress(60);
                    db = await SQLite.openDatabaseAsync('xikipedia.db', {}, dbDir.uri);
                } else {
                    db = await SQLite.openDatabaseAsync('xikipedia.db');
                }
                
                console.log('Loading profile...');
                setLoadingProgress(80);
                const algo = new XikipediaAlgorithm(db);
                await algo.loadProfile();
                setAlgorithm(algo);
                
                console.log('Profile loaded, seenPosts:', algo.profile.seenPosts.length);
                if (algo.profile.seenPosts.length === 0) {
                    console.log('Showing start screen');
                    setShowStart(true);
                    setLoading(false);
                } else {
                    console.log('Loading initial posts...');
                    setLoading(false);
                    await loadInitialPosts(algo);
                }
                console.log('Initialization complete');
            } catch (error) {
                console.error("Failed to initialize database:", error);
                setLoading(false);
            }
        };

        init();
    }, []);

    const loadInitialPosts = async (algo: XikipediaAlgorithm) => {
        const initialPosts = [];
        for (let i = 0; i < 5; i++) {
            console.log(`Getting post ${i+1}...`);
            const post = await algo.getNextPost();
            initialPosts.push(post);
            console.log(`Engaging post ${i+1}...`);
            await algo.engagePost(post, -5); // Baseline engagement for showing up
        }
        setPosts(initialPosts);
    };

    const handleStart = async (selectedCategories: string[]) => {
        if (!algorithm) return;
        
        // Apply initial scores
        selectedCategories.forEach(cat => {
            algorithm.profile.categoryScores[cat.toLowerCase()] = 100;
        });
        await algorithm.saveProfile();
        
        setShowStart(false);
        setLoading(true);
        await loadInitialPosts(algorithm);
        setLoading(false);
    };

    const loadMore = useCallback(async () => {
        if (!algorithm) return;
        const newPost = await algorithm.getNextPost();
        await algorithm.engagePost(newPost, -5); // Baseline engagement
        algorithm.incrementScroll();
        setPosts(prev => [...prev, newPost]);
    }, [algorithm]);

    const handleLike = async (page: Page) => {
        if (!algorithm) return;
        await algorithm.toggleLike(page);
        setPosts(prev => [...prev]);
    };

    const handlePress = async (page: Page) => {
        await algorithm?.engagePost(page, 75);
        const url = `https://simple.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
        Linking.openURL(url);
    };

    const handleImagePress = async (page: Page) => {
        await algorithm?.engagePost(page, 100);
        if (page.image) setSelectedImage(page.image);
    };

    const renderItem = ({ item }: { item: Page }) => (
        <PostCard 
            page={item}
            isLiked={algorithm?.profile.likedPosts.includes(item.id) || false}
            onLike={() => handleLike(item)}
            onPress={() => handlePress(item)}
            onImagePress={() => handleImagePress(item)}
        />
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1DA1F2" />
                <Text style={styles.loadingText}>Initializing Database... {loadingProgress}%</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList 
                ref={flatListRef}
                data={posts}
                renderItem={renderItem}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                onEndReached={loadMore}
                onEndReachedThreshold={2}
                removeClippedSubviews={true}
                maxToRenderPerBatch={5}
                windowSize={10}
            />

            <StartScreen visible={showStart} onStart={handleStart} />

            <Modal 
                visible={!!selectedImage} 
                transparent={true} 
                animationType="fade"
                onRequestClose={() => setSelectedImage(null)}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity 
                        style={styles.closeModal} 
                        onPress={() => setSelectedImage(null)}
                    >
                        <X size={32} color="white" />
                    </TouchableOpacity>
                    {selectedImage && (
                        <Image 
                            source={{ uri: selectedImage }} 
                            style={styles.fullImage} 
                            contentFit="contain"
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#15202B',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#15202B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 16,
        fontSize: 16,
        fontWeight: '600',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    closeModal: {
        position: 'absolute',
        top: 40,
        right: 20,
        zIndex: 10,
    }
});
