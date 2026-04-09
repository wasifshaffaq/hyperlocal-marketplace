package com.hyperlocal.data.cache

import androidx.room.*
import kotlinx.coroutines.flow.*

@Entity(tableName = "cached_shops")
data class ShopEntity(@PrimaryKey val id: String, val name: String, val rating: Double, val eta: String)

@Dao
interface ShopDao {
    @Query("SELECT * FROM cached_shops")
    fun getShopsFlow(): Flow<List<ShopEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertShops(shops: List<ShopEntity>)

    @Query("DELETE FROM cached_shops")
    suspend fun clearShops()

    @Transaction
    suspend fun clearAndInsertShops(shops: List<ShopEntity>) {
        clearShops()
        insertShops(shops)
    }
}