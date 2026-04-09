package com.hyperlocal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val tokenManager: TokenManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val accessToken = tokenManager.getAccessToken()
        val requestBuilder = originalRequest.newBuilder().header("Authorization", "Bearer $accessToken")
        var response = chain.proceed(requestBuilder.build())

        if (response.code == 401) {
            synchronized(this) {
                val newToken = tokenManager.refreshTokenSync()
                if (newToken != null) {
                    response.close()
                    val newRequest = originalRequest.newBuilder().header("Authorization", "Bearer $newToken").build()
                    response = chain.proceed(newRequest)
                }
            }
        }
        return response
    }
}

interface TokenManager {
    fun getAccessToken(): String?
    fun refreshTokenSync(): String?
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { Surface { Text("Hyperlocal Entry Point") } } }
    }
}