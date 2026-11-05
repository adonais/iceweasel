/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.logins.exceptions.db

import android.content.Context
import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class LoginExceptionDaoTest {
    private val context: Context
        get() = ApplicationProvider.getApplicationContext()

    private lateinit var database: LoginExceptionDatabase
    private lateinit var loginExceptionDao: LoginExceptionDao
    private lateinit var executor: ExecutorService

    @get:Rule var instantTaskExecutorRule = InstantTaskExecutorRule()

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(context, LoginExceptionDatabase::class.java).build()
        loginExceptionDao = database.loginExceptionDao()
        executor = Executors.newSingleThreadExecutor()
    }

    @After
    fun tearDown() {
        database.close()
        executor.shutdown()
    }

    @Test
    fun testAddingLoginException() = runTest {
        val exception = LoginExceptionEntity(origin = "mozilla.org")
        exception.id = loginExceptionDao.insertLoginException(exception)

        val loginExceptionsList = loginExceptionDao.getLoginExceptionsList()

        assertEquals(1, loginExceptionsList.size)
        assertEquals(exception, loginExceptionsList[0])
    }

    @Test
    fun testRemovingLoginException() = runTest {
        val exception1 = LoginExceptionEntity(origin = "mozilla.org")
        exception1.id = loginExceptionDao.insertLoginException(exception1)

        val exception2 = LoginExceptionEntity(origin = "firefox.com")
        exception2.id = loginExceptionDao.insertLoginException(exception2)

        loginExceptionDao.deleteLoginException(exception1)

        val loginExceptionsList = loginExceptionDao.getLoginExceptionsList()

        assertEquals(1, loginExceptionsList.size)
        assertEquals(exception2, loginExceptionsList[0])
    }
}
